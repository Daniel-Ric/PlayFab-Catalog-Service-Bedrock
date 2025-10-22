const { sendPlayFabRequest, isValidItem, transformItem, buildSearchPayload, fetchAllMarketplaceItemsEfficiently, getItemsByIds, getStoreItems, getItemReviewSummary, getItemReviews } = require("../utils/playfab");
const { resolveTitle } = require("../utils/titles");
const { loadCreators, resolveCreatorId } = require("../utils/creators");
const { buildFilter } = require("../utils/filter");
const featuredServers = require("../config/featuredServers");

const OS = process.env.OS || "iOS";
const PAGE_SIZE = 100;
const PROD_TITLE_ID = (process.env.TITLE_ID || "20CA2").toLowerCase();
const MULTILANG_ALL = process.env.MULTILANG_ALL === "true";
const ENRICH_BATCH = Math.max(10, parseInt(process.env.MULTILANG_ENRICH_BATCH || "100", 10));
const ENRICH_CONCURRENCY = Math.max(1, parseInt(process.env.MULTILANG_ENRICH_CONCURRENCY || "5", 10));
const STORE_CONCURRENCY = Math.max(1, parseInt(process.env.STORE_CONCURRENCY || "4", 10));
const STORE_MAX_FOR_PRICE_ENRICH = Math.max(1, parseInt(process.env.STORE_MAX_FOR_PRICE_ENRICH || "12", 10));

const creatorsArr = loadCreators();
const creatorsByNormalized = new Map(creatorsArr.map(c => [String(c.creatorName).replace(/\s/g, "").toLowerCase(), c]));
const titlesMap = require("../utils/titles").loadTitles();

function andFilter(a, b) {
    const A = (a || "").trim();
    const B = (b || "").trim();
    if (A && B) return `(${A}) and (${B})`;
    return A || B || "";
}

async function searchLoop(titleId, { filter = "", orderBy = "creationDate desc", batch = 300, maxBatches = Number(process.env.MAX_SEARCH_BATCHES || 10) }) {
    const out = [];
    for (let i = 0, skip = 0; i < maxBatches; i += 1, skip += batch) {
        const payload = buildSearchPayload({ filter, search: "", top: batch, skip, orderBy });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const items = (data.Items || []).filter(isValidItem).map(transformItem);
        if (!items.length) break;
        out.push(...items);
        if (items.length < batch) break;
    }
    return out;
}

function getPrimaryTitleIdUnified() {
    const v = (process.env.FEATURED_PRIMARY_ALIAS || process.env.DEFAULT_ALIAS || "").trim();
    if (v) {
        try {
            const id = resolveTitle(v);
            return String(id).toLowerCase();
        } catch {
            if (/^[A-Za-z0-9]{4,10}$/.test(v)) return v.toLowerCase();
        }
    }
    return PROD_TITLE_ID;
}

function esc(v) {
    return String(v).replace(/'/g, "''");
}

function normDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchStores(titleId) {
    const data = await sendPlayFabRequest(titleId, "Catalog/SearchStores", {}, "X-EntityToken", 2, OS);
    const stores = data?.Stores || data?.data?.Stores || [];
    return stores;
}

async function fetchStoresWithItems(titleId) {
    const stores = await fetchStores(titleId);
    if (!stores.length) return [];
    const tasks = [];
    for (let i = 0; i < stores.length; i += STORE_CONCURRENCY) {
        const chunk = stores.slice(i, i + STORE_CONCURRENCY);
        const res = await Promise.all(chunk.map(async s => {
            const r = await getStoreItems(titleId, s.Id || s.id, OS);
            return { Store: s, Items: r.Items || r.items || [] };
        }));
        tasks.push(...res);
    }
    return tasks;
}

async function fetchItemsByIds(titleId, ids) {
    const raw = await getItemsByIds(titleId, ids, OS, ENRICH_BATCH, ENRICH_CONCURRENCY);
    const details = {};
    for (const it of raw) details[it.Id] = it;
    return details;
}

function toSaleHeader(entry) {
    const raw = entry?.Store || entry || {};
    const dp = raw.DisplayProperties || {};
    const discount = typeof dp.discount === "number" ? Math.round(dp.discount * 100) : null;
    const title = raw.Title?.NEUTRAL || raw.Title?.neutral || raw.Title?.en || raw.Name || "Unknown Title";
    return {
        id: raw.Id || raw.id,
        catalogVersion: raw.CatalogVersion || null,
        title,
        description: raw.Description?.NEUTRAL || raw.Description?.neutral || null,
        starts: normDate(dp.startDate || raw.StartDate),
        expires: normDate(dp.endDate || raw.EndDate),
        discountPercent: discount,
        tags: raw.Tags || [],
        platforms: raw.Platforms || [],
        virtualCurrencyPrices: raw.VirtualCurrencyPrices || null,
        realCurrencyPrices: raw.RealCurrencyPrices || null,
        itemRefs: Array.isArray(raw.ItemReferences) ? raw.ItemReferences.map(r => ({
            id: r.Id,
            prices: (r.Price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => ({
                currencyId: a.CurrencyId,
                amount: a.Amount
            })))
        })) : []
    };
}

function buildSalesResponse(headers, itemDetails, creatorDisplayNameFilter) {
    const sales = {};
    const itemsPerCreator = {};
    let totalItems = 0;
    for (const h of headers) {
        const items = h.itemRefs.map(ref => {
            const d = itemDetails[ref.id] || {};
            return {
                id: ref.id,
                prices: ref.prices,
                catalogVersion: d.CatalogVersion || null,
                customData: d.CustomData || null,
                contentType: d.ContentType || null,
                title: d.Title?.NEUTRAL || d.Title?.neutral || null,
                description: d.Description?.NEUTRAL || d.Description?.neutral || null,
                tags: d.Tags || [],
                platforms: d.Platforms || [],
                keywords: d.Keywords || {},
                images: d.Images || [],
                virtualCurrencyPrices: d.VirtualCurrencyPrices || null,
                realCurrencyPrices: d.RealCurrencyPrices || null,
                rawItem: d
            };
        });
        const filteredItems = creatorDisplayNameFilter ? items.filter(i => i.rawItem?.DisplayProperties?.creatorName === creatorDisplayNameFilter) : items;
        if (!filteredItems.length) continue;
        sales[h.id] = {
            id: h.id,
            catalogVersion: h.catalogVersion,
            title: h.title,
            description: h.description,
            startDate: h.starts,
            endDate: h.expires,
            discountPercent: h.discountPercent,
            virtualCurrencyPrices: h.virtualCurrencyPrices,
            realCurrencyPrices: h.realCurrencyPrices,
            tags: h.tags,
            platforms: h.platforms,
            items: filteredItems
        };
        for (const it of filteredItems) {
            const name = it.rawItem?.DisplayProperties?.creatorName || "Unknown";
            itemsPerCreator[name] = (itemsPerCreator[name] || 0) + 1;
            totalItems += 1;
        }
    }
    return { totalItems, itemsPerCreator, sales };
}

async function enrichWithFullItems(titleId, items) {
    if (!MULTILANG_ALL || !items || !items.length) return items;
    const ids = items.map(i => i.Id);
    const full = await getItemsByIds(titleId, ids, OS, ENRICH_BATCH, ENRICH_CONCURRENCY);
    const byId = new Map(full.map(i => [i.Id, i]));
    return items.map(i => byId.get(i.Id) || i);
}

async function enrichItemsWithResolvedReferences(titleId, items) {
    const allRefIds = [];
    for (const it of items) {
        const refs = Array.isArray(it.ItemReferences) ? it.ItemReferences : [];
        for (const r of refs) if (r?.Id) allRefIds.push(r.Id);
    }
    const unique = Array.from(new Set(allRefIds));
    if (!unique.length) return items;
    const refDetails = await getItemsByIds(titleId, unique, OS, ENRICH_BATCH, ENRICH_CONCURRENCY);
    const refMap = new Map(refDetails.map(x => [x.Id, transformItem(x)]));
    return items.map(it => {
        const refs = Array.isArray(it.ItemReferences) ? it.ItemReferences : [];
        const resolved = refs.map(r => refMap.get(r.Id)).filter(Boolean);
        return { ...it, ResolvedReferences: resolved };
    });
}

async function enrichItemWithStorePrices(titleId, itemId) {
    const stores = await fetchStores(titleId);
    if (!stores.length) return [];
    const limited = stores.slice(0, STORE_MAX_FOR_PRICE_ENRICH);
    const prices = [];
    for (let i = 0; i < limited.length; i += STORE_CONCURRENCY) {
        const chunk = limited.slice(i, i + STORE_CONCURRENCY);
        const res = await Promise.all(chunk.map(async s => {
            const r = await getStoreItems(titleId, s.Id || s.id, OS);
            const items = r.Items || r.items || [];
            const hit = items.find(si => si?.Item?.Id === itemId || si?.ItemId === itemId);
            if (!hit) return null;
            const amounts = (hit?.Price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => ({ currencyId: a.CurrencyId, amount: a.Amount })));
            return { storeId: s.Id || s.id, storeTitle: s.Title || s.Name, amounts };
        }));
        for (const x of res) if (x && x.amounts && x.amounts.length) prices.push(x);
    }
    return prices;
}

async function enrichItemWithReviews(titleId, itemId, take = 10) {
    const summary = await getItemReviewSummary(titleId, itemId, OS);
    const reviews = await getItemReviews(titleId, itemId, take, 0, OS);
    return { summary: summary || {}, reviews: reviews?.Reviews || reviews?.reviews || [] };
}

function parseExpand(expandParam) {
    const set = new Set(String(expandParam || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
    return { prices: set.has("prices"), reviews: set.has("reviews"), refs: set.has("refs") || set.has("references") };
}

module.exports = {
    async fetchAll(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const tagClause = query.tag ? `tags/any(t:t eq '${String(query.tag).replace(/'/g, "''")}')` : "";
        const base = buildFilter({ query }, creatorsArr);
        const filter = andFilter(base, tagClause);
        const list = await fetchAllMarketplaceItemsEfficiently(titleId, filter, OS, 300, 5);
        const enriched = await enrichWithFullItems(titleId, list);
        const withRefs = await enrichItemsWithResolvedReferences(titleId, enriched);
        return withRefs;
    },

    async fetchLatest(alias, count, query = {}) {
        const titleId = resolveTitle(alias);
        const filter = buildFilter({ query }, creatorsArr);
        const payload = buildSearchPayload({
            filter,
            search: "",
            top: Math.min(Number(count) || 10, 50),
            skip: 0,
            orderBy: "creationDate desc"
        });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        let items = (data.Items || []).filter(isValidItem);
        items = await enrichWithFullItems(titleId, items);
        items = await enrichItemsWithResolvedReferences(titleId, items);
        return items.map(transformItem);
    },

    async search(alias, creatorName, keyword) {
        const titleId = resolveTitle(alias);
        const cid = resolveCreatorId(creatorsArr, creatorName);
        const filter = `creatorId eq '${cid.replace(/'/g, "''")}'`;
        const payload = buildSearchPayload({
            filter,
            search: `"${keyword}"`,
            top: PAGE_SIZE,
            skip: 0,
            orderBy: "creationDate desc"
        });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        let items = (data.Items || []).filter(isValidItem);
        items = await enrichWithFullItems(titleId, items);
        items = await enrichItemsWithResolvedReferences(titleId, items);
        return items.map(transformItem);
    },

    async fetchPopular(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const filter = buildFilter({ query }, creatorsArr);
        let items = await searchLoop(titleId, { filter, orderBy: "rating/totalcount desc", batch: 300 });
        items = await enrichWithFullItems(titleId, items);
        items = await enrichItemsWithResolvedReferences(titleId, items);
        return items;
    },

    async fetchByTag(alias, tag) {
        const titleId = resolveTitle(alias);
        const tagClause = `tags/any(t:t eq '${String(tag).replace(/'/g, "''")}')`;
        const list = await fetchAllMarketplaceItemsEfficiently(titleId, tagClause, OS, 300, 5);
        const enriched = await enrichWithFullItems(titleId, list);
        const withRefs = await enrichItemsWithResolvedReferences(titleId, enriched);
        return withRefs;
    },

    async fetchFree(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const base = buildFilter({ query }, creatorsArr);
        const freeClause = "displayProperties/price eq 0";
        const filter = andFilter(base, freeClause);
        const list = await fetchAllMarketplaceItemsEfficiently(titleId, filter, OS, 300, 5);
        const enriched = await enrichWithFullItems(titleId, list);
        const withRefs = await enrichItemsWithResolvedReferences(titleId, enriched);
        return withRefs;
    },

    async fetchDetails(alias, itemId, expandParam) {
        const titleId = resolveTitle(alias);
        const expand = parseExpand(expandParam);
        const raw = await getItemsByIds(titleId, [itemId], OS, ENRICH_BATCH, ENRICH_CONCURRENCY);
        const items = raw.filter(isValidItem).map(transformItem);
        if (!items.length) {
            const e = new Error("Item nicht gefunden.");
            e.status = 404;
            throw e;
        }
        const base = items[0];
        const withRefs = expand.refs ? await enrichItemsWithResolvedReferences(titleId, [base]) : [base];
        const prices = expand.prices ? await enrichItemWithStorePrices(titleId, itemId) : [];
        const reviews = expand.reviews ? await enrichItemWithReviews(titleId, itemId, 10) : { summary: {}, reviews: [] };
        return { ...withRefs[0], StorePrices: prices, Reviews: reviews };
    },

    async fetchSummary(alias) {
        const all = await this.fetchAll(alias, {});
        return all.map(i => ({
            id: i.Id,
            title: i.Title?.NEUTRAL || i.Title?.neutral || "",
            detailsUrl: `https://view-marketplace.net/details/${i.Id}`,
            clientUrl: `https://open.view-marketplace.net/StoreOffer/${i.Id}`
        }));
    },

    async fetchCompare(creatorName) {
        const cid = resolveCreatorId(creatorsArr, creatorName);
        const entries = Object.entries(titlesMap).map(async ([alias, { id: titleId }]) => {
            const filter = `creatorId eq '${esc(cid)}'`;
            let items = await searchLoop(titleId, { filter, orderBy: "creationDate desc", batch: 300 });
            items = await enrichWithFullItems(titleId, items);
            items = await enrichItemsWithResolvedReferences(titleId, items);
            return [alias, items];
        });
        return Object.fromEntries(await Promise.all(entries));
    },

    async resolveByItemId(alias, itemId) {
        const titleId = resolveTitle(alias);
        const raw = await getItemsByIds(titleId, [itemId], OS, ENRICH_BATCH, ENRICH_CONCURRENCY);
        const items = raw.filter(isValidItem).map(transformItem);
        if (!items.length) {
            const e = new Error("Item nicht gefunden.");
            e.status = 404;
            throw e;
        }
        const base = items[0];
        const withRefs = await enrichItemsWithResolvedReferences(titleId, [base]);
        return withRefs[0];
    },

    async resolveByFriendly(alias, friendlyId) {
        const titleId = resolveTitle(alias);
        const filter = `alternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq '${String(friendlyId).replace(/'/g, "''")}')`;
        const payload = buildSearchPayload({ filter, search: "", top: 1, skip: 0 });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const items = data.Items || [];
        if (!items.length) {
            const e = new Error(`Kein Item mit FriendlyId ${friendlyId} gefunden.`);
            e.status = 404;
            throw e;
        }
        const id = items[0].Id;
        const full = await getItemsByIds(titleId, [id], OS, ENRICH_BATCH, ENRICH_CONCURRENCY);
        const t = full.filter(isValidItem).map(transformItem)[0];
        const withRefs = await enrichItemsWithResolvedReferences(titleId, [t]);
        return withRefs[0];
    },

    async fetchByFriendly(alias, friendlyId) {
        const titleId = resolveTitle(alias);
        const filter = `alternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq '${String(friendlyId).replace(/'/g, "''")}')`;
        const payload = buildSearchPayload({ filter, search: "", top: 1, skip: 0 });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const items = data.Items || [];
        if (!items.length) {
            const e = new Error(`No item with the FriendlyId ${friendlyId} has been found`);
            e.status = 404;
            throw e;
        }
        const id = items[0].Id;
        const full = await getItemsByIds(titleId, [id], OS, ENRICH_BATCH, ENRICH_CONCURRENCY);
        const t = full.filter(isValidItem).map(transformItem)[0];
        const withRefs = await enrichItemsWithResolvedReferences(titleId, [t]);
        return withRefs[0];
    },

    async fetchFeaturedServers() {
        const titleId = getPrimaryTitleIdUnified();
        const ids = featuredServers.map(s => s.id);
        const full = await getItemsByIds(titleId, ids, OS, ENRICH_BATCH, ENRICH_CONCURRENCY);
        const byId = new Map(full.map(raw => {
            const t = transformItem(raw);
            return [t.Id || raw.Id || raw.id, t];
        }));
        return featuredServers.map(s => {
            const it = byId.get(s.id);
            return { name: s.name, id: s.id, items: it ? [it] : [] };
        });
    },

    async fetchSales(query = {}) {
        const titleId = PROD_TITLE_ID;
        const storesWithItems = await fetchStoresWithItems(titleId);
        if (!storesWithItems.length) return { totalItems: 0, itemsPerCreator: {}, sales: {} };
        const headers = storesWithItems.map(x => {
            const s = x.Store;
            if (!s.ItemReferences && Array.isArray(x.Items)) {
                s.ItemReferences = x.Items.map(i => ({
                    Id: i?.Item?.Id || i?.ItemId,
                    Price: i?.Price
                })).filter(r => r.Id);
            }
            return toSaleHeader({ Store: s });
        }).filter(h => h.id);
        const allIds = headers.flatMap(h => h.itemRefs.map(r => r.id));
        const details = await fetchItemsByIds(titleId, allIds);
        let creatorDisplayNameFilter = null;
        if (query.creator) {
            const normalized = String(query.creator).replace(/\s/g, "").toLowerCase();
            const entry = creatorsByNormalized.get(normalized);
            if (!entry) {
                const e = new Error(`Ungültiger Creator: ${query.creator}`);
                e.status = 400;
                throw e;
            }
            creatorDisplayNameFilter = entry.displayName;
        }
        return buildSalesResponse(headers, details, creatorDisplayNameFilter);
    },

    async fetchStoreCollections(alias, storeIds = []) {
        const titleId = resolveTitle(alias);
        const arr = Array.isArray(storeIds) && storeIds.length ? storeIds : [];
        const stores = arr.length ? arr.map(id => ({ Id: id })) : await fetchStores(titleId);
        const out = {};
        for (let i = 0; i < stores.length; i += STORE_CONCURRENCY) {
            const chunk = stores.slice(i, i + STORE_CONCURRENCY);
            const res = await Promise.all(chunk.map(s => getStoreItems(titleId, s.Id || s.id, OS)));
            for (let j = 0; j < chunk.length; j++) {
                const sid = chunk[j].Id || chunk[j].id;
                const items = (res[j].Items || res[j].items || []).map(it => ({
                    itemId: it?.Item?.Id || it?.ItemId,
                    prices: (it?.Price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => ({ currencyId: a.CurrencyId, amount: a.Amount })))
                }));
                out[sid] = items;
            }
        }
        return out;
    }
};
