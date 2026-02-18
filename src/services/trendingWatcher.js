// -----------------------------------------------------------------------------
//
// File: src/services/trendingWatcher.js
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

const {sendPlayFabRequest, buildSearchPayload, isValidItem} = require("../utils/playfab");
const {resolveTitle} = require("../utils/titles");

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

async function fetchWindow(titleId, os, hours, top, pages) {
    const out = [];
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const filter = `creationDate ge ${since}`;
    const orderBy = "creationDate desc";
    const search = "";
    for (let i = 0; i < pages; i++) {
        const skip = i * top;
        const payload = buildSearchPayload({filter, search, top, skip, orderBy, expandFields: "images"});
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 2, os);
        const items = (data.Items || []).filter(isValidItem);
        if (!items.length) break;
        out.push(...items);
        if (items.length < top) break;
    }
    return out;
}

function scoreCreators(items) {
    const map = new Map();
    for (const it of items) {
        const name = it.DisplayProperties && it.DisplayProperties.creatorName ? it.DisplayProperties.creatorName : "Unknown";
        const w = 1;
        const cur = map.get(name) || 0;
        map.set(name, cur + w);
    }
    const arr = Array.from(map.entries()).map(([creator, score]) => ({creator, score}));
    arr.sort((a, b) => b.score - a.score);
    return arr;
}

class TrendingWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.lastPayload = null;
        this.lastRunTs = 0;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;
        const os = process.env.OS || "iOS";
        const intervalMs = Math.max(30000, parseInt(process.env.TRENDING_INTERVAL_MS || "60000", 10));
        const hours = Math.max(1, parseInt(process.env.TRENDING_WINDOW_HOURS || "24", 10));
        const top = Math.max(50, parseInt(process.env.TRENDING_PAGE_TOP || "200", 10));
        const pages = Math.max(1, parseInt(process.env.TRENDING_PAGES || "3", 10));
        const limit = Math.max(5, parseInt(process.env.TRENDING_TOP_N || "20", 10));
        const run = async () => {
            const titleId = getTitleId();
            const items = await fetchWindow(titleId, os, hours, top, pages);
            const leaders = scoreCreators(items).slice(0, limit);
            const payload = {ts: Date.now(), periodHours: hours, leaders};
            this.lastPayload = payload;
            this.lastRunTs = Date.now();
            eventBus.emit("creator.trending", payload);
        };
        run().catch(() => {
        });
        this.timer = setInterval(() => run().catch(() => {
        }), intervalMs);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const trendingWatcher = new TrendingWatcher();
module.exports = {trendingWatcher};
