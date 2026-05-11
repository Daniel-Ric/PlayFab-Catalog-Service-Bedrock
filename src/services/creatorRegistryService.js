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
        } else if (previous.displayName !== current.displayName || previous.creatorName !== current.creatorName) {
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
    const current = await fetchCreatorRegistry(titleId);
    const diff = diffCreators(previous, current);
    saveCreators(current);
    return {previous, current, diff};
}

module.exports = {
    fetchCreatorRegistry,
    syncCreatorRegistry,
    extractCreatorsArray,
    normalizeCreatorName,
    diffCreators,
    getTitleId,
    _internals: {getTitleId}
};
