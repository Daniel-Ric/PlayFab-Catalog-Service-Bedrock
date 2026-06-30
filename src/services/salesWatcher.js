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

const {sendPlayFabRequest, getStoreItems, getItemsByIds} = require("../utils/playfab");
const {resolveTitle} = require("../utils/titles");
const {stableHash} = require("../utils/hash");
const {createNonOverlappingRunner} = require("../utils/watcherRun");
const {projectCatalogItem} = require("../utils/projectors");
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

function pickLocale(obj) {
    if (!obj || typeof obj !== "object") return null;
    return obj["en-US"] || obj["en-GB"] || obj.NEUTRAL || obj.neutral || Object.values(obj)[0] || null;
}

function normDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function readPriceAmounts(price) {
    return (price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => ({
        currencyId: a.CurrencyId,
        amount: a.Amount
    }))).filter(p => p.currencyId && typeof p.amount === "number");
}

function itemIdFromStoreItem(item) {
    return item?.Item?.Id || item?.Item?.id || item?.ItemId || item?.itemId || item?.Id || item?.id || null;
}

function refsFromStoreAndItems(store, items) {
    if (Array.isArray(store?.ItemReferences) && store.ItemReferences.length) {
        return store.ItemReferences.map(r => ({
            id: r?.Id || r?.id,
            prices: readPriceAmounts(r?.Price)
        })).filter(r => r.id);
    }
    if (!Array.isArray(items)) return [];
    return items.map(i => ({
        id: itemIdFromStoreItem(i),
        prices: readPriceAmounts(i?.Price)
    })).filter(r => r.id);
}

function saleSummary(sale) {
    if (!sale) return null;
    return {
        id: sale.id,
        catalogVersion: sale.catalogVersion,
        title: sale.title,
        description: sale.description,
        startDate: sale.startDate,
        endDate: sale.endDate,
        discountPercent: sale.discountPercent,
        virtualCurrencyPrices: sale.virtualCurrencyPrices,
        realCurrencyPrices: sale.realCurrencyPrices,
        tags: sale.tags,
        platforms: sale.platforms
    };
}

function buildSaleEntry(store, items, itemDetails) {
    const s = store || {};
    const sid = s.Id || s.id || "unknown";
    const dp = s.DisplayProperties || {};
    const refs = refsFromStoreAndItems(s, items);
    const discount = typeof dp.discount === "number" ? Math.round(dp.discount * 100) : null;
    const sale = {
        id: sid,
        catalogVersion: s.CatalogVersion || null,
        title: pickLocale(s.Title) || s.Name || "Unknown Title",
        description: pickLocale(s.Description),
        startDate: normDate(dp.startDate || s.StartDate),
        endDate: normDate(dp.endDate || s.EndDate),
        discountPercent: discount,
        virtualCurrencyPrices: s.VirtualCurrencyPrices || null,
        realCurrencyPrices: s.RealCurrencyPrices || null,
        tags: Array.isArray(s.Tags) ? s.Tags : [],
        platforms: Array.isArray(s.Platforms) ? s.Platforms : [],
        items: refs.map(ref => {
            const detail = itemDetails.get(ref.id) || null;
            return {
                ...projectCatalogItem(detail || {Id: ref.id}),
                id: ref.id,
                prices: ref.prices,
                sale: null
            };
        })
    };
    const summary = saleSummary(sale);
    sale.items = sale.items.map(item => ({...item, sale: summary}));
    const hash = stableHash({
        sale: summary,
        items: refs.map(ref => ({
            id: ref.id,
            prices: ref.prices.slice().sort((a, b) => {
                const byCurrency = String(a.currencyId).localeCompare(String(b.currencyId));
                return byCurrency || a.amount - b.amount;
            })
        })).sort((a, b) => String(a.id).localeCompare(String(b.id)))
    });
    return {
        id: sid,
        hash,
        count: refs.length,
        sale
    };
}

async function fetchItemDetails(titleId, os, storesWithItems, batchSize, concurrency) {
    const ids = [];
    for (const x of storesWithItems) {
        for (const ref of refsFromStoreAndItems(x.Store, x.Items)) ids.push(ref.id);
    }
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (!unique.length) return new Map();
    const items = await getItemsByIds(titleId, unique, os, batchSize, concurrency);
    return new Map(items.map(item => [item?.Id || item?.id, item]).filter(pair => pair[0]));
}

function snapshot(storesWithItems, itemDetails) {
    const map = new Map();
    for (const x of storesWithItems) {
        const entry = buildSaleEntry(x.Store, x.Items, itemDetails);
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
            changes.push({storeId: k, type: "created", before: null, after: b.sale});
        } else if (a && !b) {
            changes.push({storeId: k, type: "deleted", before: a.sale, after: null});
        } else if (a && b && a.hash !== b.hash) {
            changes.push({storeId: k, type: "updated", before: a.sale, after: b.sale});
        }
    }
    return changes;
}

function buildPayload(ts, snap, changes) {
    const sales = {};
    const items = [];
    const itemsPerCreator = {};
    const seenItems = new Set();
    let totalItems = 0;

    for (const entry of snap.values()) {
        const sale = entry.sale;
        if (!sale) continue;
        sales[sale.id] = sale;
        for (const item of sale.items || []) {
            const creator = item.creatorName || item.rawItem?.DisplayProperties?.creatorName || "Unknown";
            itemsPerCreator[creator] = (itemsPerCreator[creator] || 0) + 1;
            totalItems += 1;
            const itemKey = `${item.id}:${sale.id}`;
            if (!seenItems.has(itemKey)) {
                seenItems.add(itemKey);
                items.push(item);
            }
        }
    }

    return {
        ts,
        stores: snap.size,
        count: items.length,
        totalItems,
        itemsPerCreator,
        sales,
        items,
        ...(changes ? {changes} : {})
    };
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
        const itemBatchSize = Math.max(1, parseInt(process.env.SALES_WATCH_ITEM_BATCH_SIZE || "100", 10));
        const itemConcurrency = Math.max(1, parseInt(process.env.SALES_WATCH_ITEM_CONCURRENCY || String(concurrency), 10));
        const run = async () => {
            try {
                const titleId = getTitleId();
                const storesWithItems = await fetchStoresWithItems(titleId, os, concurrency);
                const itemDetails = await fetchItemDetails(titleId, os, storesWithItems, itemBatchSize, itemConcurrency);
                const snap = snapshot(storesWithItems, itemDetails);
                if (!this.prev.size) {
                    this.prev = snap;
                    this.lastRunTs = Date.now();
                    eventBus.emit("sale.snapshot", buildPayload(Date.now(), snap));
                    return;
                }
                const changes = diff(this.prev, snap);
                this.prev = snap;
                this.lastRunTs = Date.now();
                if (changes.length) {
                    eventBus.emit("sale.update", buildPayload(Date.now(), snap, changes));
                }
            } catch (e) {
                logger.debug(`[SalesWatcher] error ${e.message || "err"}`);
                this.lastRunTs = Date.now();
            }
        };
        const runOnce = createNonOverlappingRunner({
            run,
            onError: e => {
                logger.debug(`[SalesWatcher] error ${e.message || "err"}`);
                this.lastRunTs = Date.now();
            },
            onSkip: () => logger.debug("[SalesWatcher] previous run still in progress; skipping tick")
        });
        runOnce();
        this.timer = setInterval(runOnce, intervalMs);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const salesWatcher = new SalesWatcher();
module.exports = {
    salesWatcher,
    _internals: {
        buildSaleEntry,
        buildPayload,
        diff,
        refsFromStoreAndItems,
        snapshot
    }
};
