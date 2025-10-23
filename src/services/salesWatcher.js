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

function snapshot(stores) {
    const map = new Map();
    for (const x of stores) {
        const s = x.Store || {};
        const sid = s.Id || s.id || "unknown";
        const refs = s.ItemReferences || (Array.isArray(x.Items) ? x.Items.map(i => ({
            Id: i?.Item?.Id || i?.ItemId,
            Price: i?.Price
        })) : []);
        const keyParts = refs.map(r => `${r.Id}:${JSON.stringify((r.Price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => [a.CurrencyId, a.Amount])))}`).sort();
        const h = stableHash(keyParts);
        map.set(sid, {id: sid, hash: h, count: refs.length});
    }
    return map;
}

function diff(prev, next) {
    const changes = [];
    const allKeys = new Set([...Array.from(prev.keys()), ...Array.from(next.keys())]);
    for (const k of allKeys) {
        const a = prev.get(k);
        const b = next.get(k);
        if (!a && b) changes.push({storeId: k, type: "created"}); else if (a && !b) changes.push({
            storeId: k,
            type: "deleted"
        }); else if (a && b && a.hash !== b.hash) changes.push({storeId: k, type: "updated"});
    }
    return changes;
}

class SalesWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.prev = new Map();
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
                    eventBus.emit("sale.snapshot", {ts: Date.now(), stores: snap.size});
                    return;
                }
                const changes = diff(this.prev, snap);
                if (changes.length) {
                    this.prev = snap;
                    eventBus.emit("sale.update", {ts: Date.now(), changes});
                }
            } catch (e) {
                logger.debug(`[SalesWatcher] error ${e.message || "err"}`);
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
