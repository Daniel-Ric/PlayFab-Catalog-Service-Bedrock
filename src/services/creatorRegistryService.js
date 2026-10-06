// -----------------------------------------------------------------------------
//
// File: src/services/creatorRegistryService.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
// No partnership, approval, or official relationship with Mojang AB or Microsoft is implied.
//
// All names, logos, brands, trademarks, service marks, and registered trademarks are the
// property of their respective owners and are used strictly for identification/reference only.
// This project does not claim ownership of third-party IP and provides no license to use it.
//
// -----------------------------------------------------------------------------

const axios = require("axios");
const http = require("http");
const https = require("https");
const {loadCreators, saveCreators} = require("../utils/creators");
const {resolveTitle} = require("../utils/titles");
const {fetchMCToken} = require("./featuredServersService");
const playfab = require("../utils/playfab");
const {dataCache} = require("../config/cache");
const logger = require("../config/logger");

const CREATOR_IMAGES_TTL_MS = Math.max(60000, Number(process.env.CREATOR_IMAGES_TTL_MS) || 21600000);
const CREATOR_COLLECTION_FILTER = "contentType eq 'OfferCollectionQueries_V3.0' and tags/any(t: t eq 'collection.creator')";
const STORE_CONFIG_URL = process.env.CREATOR_REGISTRY_CONFIG_URL || "https://store.mktpl.minecraft-services.net/api/v1.0/session/config";

const httpAgent = new http.Agent({
    keepAlive: true, maxSockets: Number(process.env.HTTP_MAX_SOCKETS || 512), keepAliveMsecs: 60000, scheduling: "lifo"
});

const httpsAgent = new https.Agent({
    keepAlive: true, maxSockets: Number(process.env.HTTPS_MAX_SOCKETS || 512), keepAliveMsecs: 60000, scheduling: "lifo"
});

const api = axios.create({
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 20000), httpAgent, httpsAgent, headers: {
        "Accept": "application/json", "User-Agent": "ViewMarketplace/creator-registry"
    }, validateStatus: () => true
});

function validImageUrl(value) {
    try {
        return typeof value === "string" && new URL(value).protocol === "https:";
    } catch {
        return false;
    }
}

async function fetchCreatorImageMap(titleId) {
    const images = new Map();
    let skip = 0;
    while (skip <= 10000) {
        const data = await playfab.sendPlayFabRequest(titleId, "Catalog/Search", {
            filter: CREATOR_COLLECTION_FILTER, top: 100, skip, count: true,
            orderBy: "lastModifiedDate desc", scid: "4fc10100-5f7a-4470-899b-280835760c07"
        }, "X-EntityToken", 1, process.env.OS || "iOS");
        if (!Array.isArray(data?.Items)) throw new Error("Creator collections response is missing Items");
        const total = typeof data.Count === "number" ? data.Count : null;
        for (const item of data.Items) {
            if (item?.ContentType !== "OfferCollectionQueries_V3.0" || !item.Tags?.includes("collection.creator")) continue;
            const thumbnail = (item.Images || []).find(image =>
                String(image?.Type || image?.Tag || "").toLowerCase() === "thumbnail" && validImageUrl(image.Url));
            if (!thumbnail) continue;
            const ids = item.DisplayProperties?.creatorIds;
            if (!Array.isArray(ids)) continue;
            for (const id of ids) {
                if (typeof id === "string" && !images.has(id)) images.set(id, thumbnail.Url);
            }
        }
        if (data.Items.length === 0) {
            if (total !== null && skip < total) throw new Error("Creator collections pagination ended early");
            return images;
        }
        skip += data.Items.length;
        if (total !== null ? skip >= total : data.Items.length < 100) return images;
    }
    throw new Error("Creator collections exceeded the catalog pagination limit");
}

async function enrichCreatorImages(creators, titleId = getTitleId(), maxWaitMs = 0) {
    const key = `creator-images:v1:${titleId}`;
    const refresh = dataCache.getOrSetAsync(key, () => fetchCreatorImageMap(titleId), CREATOR_IMAGES_TTL_MS).catch(error => {
        logger.warn(`[CreatorImages] ${error.message}; using stored images`);
        dataCache.set(key, null, {ttl: 60000});
        return null;
    });
    let timer;
    let images;
    try {
        images = maxWaitMs > 0 ? await Promise.race([
            refresh,
            new Promise(resolve => {timer = setTimeout(() => resolve(null), maxWaitMs);})
        ]) : await refresh;
    } finally {
        if (timer) clearTimeout(timer);
    }
    return creators.map(creator => ({
        ...creator,
        imageUrl: images ? images.get(creator.id) || null : creator.imageUrl || null
    }));
}

function getTitleId() {
    const alias = (process.env.FEATURED_PRIMARY_ALIAS || process.env.DEFAULT_ALIAS || "").trim();
    if (alias) {
        try {
            return resolveTitle(alias);
        } catch {
        }
    }
    return process.env.TITLE_ID || "20CA2";
}

function normalizeCreatorName(displayName, mode = process.env.CREATORNAME_MODE || "nospace") {
    const s = String(displayName || "").trim();
    if (!s) return "";
    if (mode === "alnum") return s.replace(/[^0-9A-Za-z_-]+/g, "");
    return s.replace(/\s+/g, "");
}

function extractCreatorsArray(data) {
    const filters = data?.result?.storeFilters || [];
    const creatorFilter = filters.find(f => String(f?.filterType || "").toLowerCase() === "creator");
    const toggles = Array.isArray(creatorFilter?.toggles) ? creatorFilter.toggles : [];
    return toggles.map(t => {
        const displayName = String(t?.filterName || "").trim();
        const id = String(t?.filterId || "").trim();
        if (!displayName || !id) return null;
        return {creatorName: normalizeCreatorName(displayName), id, displayName};
    }).filter(Boolean).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function fetchCreatorRegistry(titleId = getTitleId()) {
    const token = await fetchMCToken(titleId);
    const r = await api.get(STORE_CONFIG_URL, {
        headers: {authorization: token}
    });
    if (r.status < 200 || r.status >= 300) {
        const e = new Error(`Creator registry fetch failed with status ${r.status}`);
        e.status = r.status;
        throw e;
    }
    return extractCreatorsArray(r.data);
}

function diffCreators(previousCreators, currentCreators) {
    const previousById = new Map((previousCreators || []).map(c => [String(c.id), c]));
    const currentById = new Map((currentCreators || []).map(c => [String(c.id), c]));
    const added = [];
    const removed = [];
    const changed = [];

    for (const [id, current] of currentById) {
        const previous = previousById.get(id);
        if (!previous) {
            added.push(current);
        } else if (previous.displayName !== current.displayName || previous.creatorName !== current.creatorName
            || (previous.imageUrl || null) !== (current.imageUrl || null)) {
            changed.push({id, before: previous, after: current});
        }
    }

    for (const [id, previous] of previousById) {
        if (!currentById.has(id)) removed.push(previous);
    }

    added.sort((a, b) => a.displayName.localeCompare(b.displayName));
    removed.sort((a, b) => a.displayName.localeCompare(b.displayName));
    changed.sort((a, b) => a.after.displayName.localeCompare(b.after.displayName));
    return {added, removed, changed};
}

async function syncCreatorRegistry(titleId = getTitleId()) {
    const previous = loadCreators().slice();
    const previousById = new Map(previous.map(creator => [creator.id, creator]));
    const current = await enrichCreatorImages((await fetchCreatorRegistry(titleId)).map(creator => ({
        ...creator, imageUrl: previousById.get(creator.id)?.imageUrl || null
    })), titleId);
    const diff = diffCreators(previous, current);
    for (const creator of current) {
        const old = previousById.get(creator.id);
        creator.aliases = [...new Set([...(old?.aliases || []), old?.creatorName, old?.displayName,
            creator.creatorName, creator.displayName].filter(Boolean))];
    }
    saveCreators(current);
    return {previous, current, diff};
}

module.exports = {
    fetchCreatorRegistry,
    enrichCreatorImages,
    syncCreatorRegistry,
    extractCreatorsArray,
    normalizeCreatorName,
    diffCreators,
    getTitleId,
    _internals: {getTitleId}
};
