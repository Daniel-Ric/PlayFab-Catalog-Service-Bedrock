// -----------------------------------------------------------------------------
//
// File: src/services/serverScreenService.js
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
const {dataCache} = require("../config/cache");
const {createUpstreamGuard} = require("./playfabUpstreamGuard");

const LAYOUT_BASE = "https://layout.mktpl.minecraft-services.net";
const HOME_ID = "ServerTab";
const LANGUAGE = process.env.MC_LANGUAGE_CODE || "en-US";
const TTL = Math.max(1, Number(process.env.FEATURED_SERVERS_TTL_MS || 5 * 60 * 1000));
function setting(name, fallback, min, max) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && process.env[name]?.trim()
        ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
}

const LAYOUT_CONCURRENCY = setting("FEATURED_SERVERS_LAYOUT_CONCURRENCY", 6, 1, 6);
const LAYOUT_MIN_TIME_MS = setting("FEATURED_SERVERS_LAYOUT_MIN_TIME_MS", 0, 0, 60000);
// These are Minecraft layout calls, not PlayFab catalog calls. Bound fan-out
// without imposing a fixed delay on healthy responses; the guard still shares
// Retry-After cooldowns between all layout requests.
const layoutGuard = createUpstreamGuard({policyResolver: () => ({maxConcurrent: LAYOUT_CONCURRENCY, minTime: LAYOUT_MIN_TIME_MS})});
const api = axios.create({
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 20000),
    httpAgent: new http.Agent({keepAlive: true, maxSockets: 6, maxFreeSockets: 6}),
    httpsAgent: new https.Agent({keepAlive: true, maxSockets: 6, maxFreeSockets: 6}),
    validateStatus: () => true
});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function id(value) {
    return typeof value === "string" && UUID.test(value.trim()) ? value.trim().toLowerCase() : null;
}

function text(value) {
    return typeof value === "string" ? value : typeof value?.value === "string" ? value.value : null;
}

function image(value) {
    const variants = {};
    for (const size of ["full", "half", "quarter"]) {
        const url = text(value?.[size]?.url);
        if (url && /^https?:\/\//i.test(url)) variants[size] = url;
    }
    const url = variants.full || variants.half || variants.quarter || text(value?.url);
    return url && /^https?:\/\//i.test(url) ? {url, variants} : null;
}

function motds(record) {
    const values = record?.motds ?? record?.motd ?? record?.listing?.motd;
    return [...new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean))];
}

function layoutLink(record) {
    return record?.linksTo?.type === "layout" && typeof record.linksTo.id === "string" && record.linksTo.id.trim()
        ? record.linksTo.id.trim() : null;
}

function upstreamError(message, status = 502) {
    return Object.assign(new Error(message), {status});
}

async function fetchLayout(layoutId, token, priority = "interactive") {
    let segment;
    try { segment = encodeURIComponent(decodeURIComponent(layoutId)); }
    catch { throw upstreamError("Invalid server layout reference"); }
    let response;
    try {
        for (let attempt = 0; attempt < 3; attempt++) {
            response = await layoutGuard.schedule("minecraft", "layout/request", async () => {
                const authorization = typeof token === "function" ? await token() : await token;
                return api.post(`${LAYOUT_BASE}/api/v1.0/layout/${segment}`, {}, {
                    headers: {authorization, "accept-language": LANGUAGE, "content-type": "application/json"}
                });
            }, {trackFailure: false, priority});
            if (response.status !== 429 && response.status !== 503) break;
        }
    } catch {
        throw upstreamError("Server layout service is unavailable");
    }
    if (response.status < 200 || response.status >= 300) throw upstreamError("Server layout service is unavailable");
    const layout = response.data?.result?.layoutStructure;
    if (!Array.isArray(layout?.body?.fabs)) throw upstreamError("Invalid server layout response");
    return layout;
}

function parseHome(layout) {
    const records = new Map();
    const memberships = new Map();
    const sectionTypes = {"feature-more": "hero", "feature-play": "hero", "hero-motd": "featured", hero: "featured", "internal-servers": "trending", grid: "all", "tile-grid": "all", row: "row"};
    layout.body.fabs.forEach((section, order) => {
        const entries = section.experience ? [section.experience] : section.pagedExperiences?.experiences ?? section.pageableTiles?.tiles ?? [];
        if (!Array.isArray(entries)) return;
        entries.forEach((entry, position) => {
            const key = id(entry?.experienceId);
            if (!key) return;
            records.set(key, {...entry, ...records.get(key), experienceId: key});
            const sections = memberships.get(key) || [];
            sections.push({type: sectionTypes[section.variant] || "list", title: text(section.title), order, position});
            memberships.set(key, sections);
        });
    });
    return {records, memberships};
}

async function fetchHome(titleId, token) {
    const key = `server-screen:home:v1:${titleId}:${LANGUAGE}:${HOME_ID}`;
    return dataCache.getOrSetAsync(key, async () => parseHome(await fetchLayout(HOME_ID, token)), TTL);
}

function summary(record, sections) {
    return {
        id: id(record.experienceId), title: text(record.title), description: text(record.description),
        creator: {id: text(record.creatorId), name: text(record.creatorName)},
        images: {listing: image(record.listing?.displayImage ?? record.featuredDisplayImage), logo: image(record.logoImage), background: image(record.backgroundImage)},
        motds: motds(record), sections,
        detailsUrl: layoutLink(record) ? `/marketplace/featured-servers/${id(record.experienceId)}` : null
    };
}

async function enrichFeaturedServers(discoverySource, titleId, token) {
    const [discovery, home] = await Promise.all([
        discoverySource,
        fetchHome(titleId, token).catch(() => null)
    ]);
    const experiences = new Map();
    const records = [...home?.records || []];
    let next = 0;
    let failedServers = 0;
    await Promise.all(Array.from({length: Math.min(LAYOUT_CONCURRENCY, records.length)}, async () => {
        while (next < records.length) {
            const [key, record] = records[next++];
            let value = summary(record, home.memberships.get(key));
            if (layoutLink(record)) {
                try {
                    const metadata = detailMetadata(value, await fetchPdp(titleId, record, token, "background"));
                    value = {...metadata, title: value.title ?? metadata.title, motds: value.motds.length ? value.motds : metadata.motds};
                } catch {
                    failedServers++;
                }
            }
            experiences.set(key, value);
        }
    }));
    const items = Array.isArray(discovery?.data?.Items) ? discovery.data.Items : [];
    const seen = new Set();
    let matchedServers = 0;
    const enriched = items.map(item => {
        const key = id(item.DisplayProperties?.experienceId) || id(item.Id);
        const record = home?.records.get(key);
        if (key) seen.add(key);
        if (record) matchedServers++;
        return {...item, experience: record ? experiences.get(key) : null};
    });
    let addedServers = 0;
    for (const [key, record] of home?.records || []) {
        if (seen.has(key)) continue;
        enriched.push({Id: key, Title: {NEUTRAL: text(record.title)}, source: "server-screen", experience: experiences.get(key)});
        addedServers++;
    }
    return {
        ...discovery,
        data: {...discovery.data, Items: enriched, ...(addedServers ? {Count: (Number(discovery.data?.Count) || items.length) + addedServers} : {})},
        enrichment: {status: home ? failedServers ? "partial" : "complete" : "unavailable", matchedServers, addedServers, failedServers}
    };
}

async function fetchPdp(titleId, record, token, priority = "interactive") {
    const link = layoutLink(record);
    if (!link) throw upstreamError("Server details are not available", 404);
    const experienceId = id(record.experienceId);
    const cacheKey = `server-screen:pdp:v1:${titleId}:${LANGUAGE}:${experienceId}:${link}`;
    return dataCache.getOrSetAsync(cacheKey, async () => {
        const layout = await fetchLayout(link, token, priority);
        const details = layout.body.fabs.map(fab => fab?.experiencePdp).find(pdp => id(pdp?.experienceId) === experienceId);
        if (!details) throw upstreamError("Server details do not match the requested experience");
        return details;
    }, TTL);
}

function detailMetadata(base, details) {
    const detailMotds = motds(details);
    return {
        ...base,
        title: text(details.title) ?? base.title, description: text(details.description) ?? base.description,
        creator: {...base.creator, name: text(details.creatorName) ?? base.creator.name, image: image(details.creatorImage)},
        images: {...base.images, logo: image(details.logoImage) ?? base.images.logo, background: image(details.backgroundImage) ?? base.images.background, banner: image(details.banner)},
        motds: detailMotds.length ? detailMotds : base.motds
    };
}

async function fetchServerDetails(titleId, experienceId, token) {
    const key = id(experienceId);
    if (!key) throw upstreamError("A valid experience UUID is required", 400);
    const home = await fetchHome(titleId, token);
    const record = home.records.get(key);
    if (!record) throw upstreamError("Server experience not found", 404);
    const details = await fetchPdp(titleId, record, token);
    return {
        ...detailMetadata(summary(record, home.memberships.get(key)), details),
        activities: (Array.isArray(details.activities) ? details.activities : []).filter(a => a && typeof a === "object").map(a => ({title: text(a.title), subtitle: text(a.subtitle), description: text(a.description), image: image(a.image)})),
        news: details.news ? {title: text(details.news.title), description: text(details.news.description)} : null
    };
}

module.exports = {enrichFeaturedServers, fetchServerDetails};
