// -----------------------------------------------------------------------------
//
// File: src/services/salesWatcher.js
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

const {sendPlayFabRequest, getStoreItems} = require("../utils/playfab");
const {resolveTitle} = require("../utils/titles");
const {stableHash} = require("../utils/hash");
const logger = require("../config/logger");

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

async function fetchStores(titleId, os) {
    const data = await sendPlayFabRequest(titleId, "Catalog/SearchStores", {}, "X-EntityToken", 2, os);
    const raw = data?.Stores || data?.data?.Stores || [];
    return (raw || []).map(x => x?.Store || x).filter(Boolean);
}

async function fetchStoresWithItems(titleId, os, concurrency) {
    const stores = await fetchStores(titleId, os);
    if (!stores.length) return [];
    const out = [];
    for (let i = 0; i < stores.length; i += concurrency) {
        const chunk = stores.slice(i, i + concurrency);
        const res = await Promise.all(chunk.map(async s => {
            try {
                const r = await getStoreItems(titleId, s.Id || s.id, os);
                const items = r?.Items || r?.items || [];
                return {Store: s, Items: items};
            } catch {
                return {Store: s, Items: []};
            }
        }));
        out.push(...res);
    }
    return out;
}

function normalizeStoreSnapshotEntry(store, items) {
    const s = store || {};
    const sid = s.Id || s.id || "unknown";
    const rawRefs = Array.isArray(s.ItemReferences) && s.ItemReferences.length ? s.ItemReferences : Array.isArray(items) ? items.map(i => ({
        Id: i?.Item?.Id || i?.ItemId, Price: i?.Price
    })).filter(r => r.Id) : [];
    const keyParts = rawRefs.map(r => {
        const prices = (r.Price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => [a.CurrencyId, a.Amount]));
        prices.sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0].localeCompare(b[0]));
        return `${r.Id}:${JSON.stringify(prices)}`;
    }).sort();
    const hash = stableHash(keyParts);
    return {
        id: sid, hash, count: rawRefs.length
    };
}

function snapshot(storesWithItems) {
    const map = new Map();
    for (const x of storesWithItems) {
        const entry = normalizeStoreSnapshotEntry(x.Store, x.Items);
        map.set(entry.id, entry);
    }
    return map;
}

function diff(prev, next) {
    const changes = [];
    const allKeys = new Set([...Array.from(prev.keys()), ...Array.from(next.keys())]);
    for (const k of allKeys) {
        const a = prev.get(k);
        const b = next.get(k);
        if (!a && b) {
            changes.push({storeId: k, type: "created"});
        } else if (a && !b) {
            changes.push({storeId: k, type: "deleted"});
        } else if (a && b && a.hash !== b.hash) {
            changes.push({storeId: k, type: "updated"});
        }
    }
    return changes;
}

class SalesWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.prev = new Map();
        this.lastRunTs = 0;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;
        const intervalMs = Math.max(10000, parseInt(process.env.SALES_WATCH_INTERVAL_MS || "30000", 10));
        const os = process.env.OS || "iOS";
        const concurrency = Math.max(1, parseInt(process.env.STORE_CONCURRENCY || "4", 10));
        const run = async () => {
            try {
                const titleId = getTitleId();
                const storesWithItems = await fetchStoresWithItems(titleId, os, concurrency);
                const snap = snapshot(storesWithItems);
                if (!this.prev.size) {
                    this.prev = snap;
                    this.lastRunTs = Date.now();
                    eventBus.emit("sale.snapshot", {
                        ts: Date.now(), stores: snap.size
                    });
                    return;
                }
                const changes = diff(this.prev, snap);
                this.prev = snap;
                this.lastRunTs = Date.now();
                if (changes.length) {
                    eventBus.emit("sale.update", {
                        ts: Date.now(), changes
                    });
                }
            } catch (e) {
                logger.debug(`[SalesWatcher] error ${e.message || "err"}`);
                this.lastRunTs = Date.now();
            }
        };
        run();
        this.timer = setInterval(run, intervalMs);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const salesWatcher = new SalesWatcher();
module.exports = {salesWatcher};
