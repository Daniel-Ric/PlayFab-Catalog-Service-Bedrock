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

function priceSignature(amounts) {
    if (!Array.isArray(amounts)) return "";
    const flat = amounts.map(a => [a.CurrencyId, a.Amount]);
    flat.sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0].localeCompare(b[0]));
    return stableHash(flat);
}

async function fetchStoreItemsBatched(titleId, stores, os, concurrency) {
    const out = [];
    for (let i = 0; i < stores.length; i += concurrency) {
        const chunk = stores.slice(i, i + concurrency);
        const res = await Promise.all(chunk.map(async s => {
            try {
                const r = await getStoreItems(titleId, s.Id || s.id, os);
                const items = r?.Items || r?.items || [];
                return {storeId: s.Id || s.id, items};
            } catch {
                return {storeId: s.Id || s.id, items: []};
            }
        }));
        out.push(...res);
    }
    return out;
}

function computeBestPrices(storeItems) {
    const best = new Map();
    for (const s of storeItems) {
        for (const it of s.items) {
            const id = it?.Item?.Id || it?.ItemId;
            if (!id) continue;
            const amounts = (it?.Price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => ({
                currencyId: a.CurrencyId, amount: a.Amount
            })));
            if (!amounts.length) continue;
            const sig = priceSignature(amounts);
            const prev = best.get(id);
            if (!prev) best.set(id, {sig, samples: 1}); else if (prev.sig !== sig) best.set(id, {
                sig, samples: prev.samples + 1
            });
        }
    }
    return best;
}

class PriceWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.prev = new Map();
        this.lastRunTs = 0;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;
        const os = process.env.OS || "iOS";
        const intervalMs = Math.max(10000, parseInt(process.env.PRICE_WATCH_INTERVAL_MS || "30000", 10));
        const concurrency = Math.max(1, parseInt(process.env.STORE_CONCURRENCY || "4", 10));

        const run = async () => {
            try {
                const titleId = getTitleId();
                const stores = await fetchStores(titleId, os);
                if (!stores.length) {
                    return;
                }
                const limited = stores.slice(0, Math.max(1, parseInt(process.env.PRICE_WATCH_MAX_STORES || "50", 10)));
                const batches = await fetchStoreItemsBatched(titleId, limited, os, concurrency);
                const best = computeBestPrices(batches);
                if (this.prev.size === 0) {
                    this.prev = best;
                    return;
                }
                const changes = [];
                for (const [id, info] of best.entries()) {
                    const prev = this.prev.get(id);
                    if (!prev) continue;
                    if (prev.sig !== info.sig) changes.push({itemId: id, ts: Date.now(), from: prev.sig, to: info.sig});
                }
                if (changes.length) eventBus.emit("price.changed", {ts: Date.now(), changes});
                this.prev = best;
            } catch (e) {
                logger.debug(`[PriceWatcher] error ${e.message || "err"}`);
            } finally {
                this.lastRunTs = Date.now();
            }
        };

        run();
        this.timer = setInterval(() => {
            run();
        }, intervalMs);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const priceWatcher = new PriceWatcher();
module.exports = {priceWatcher};
