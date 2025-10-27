const {
    sendPlayFabRequest,
    isValidItem,
    transformItem,
    buildSearchPayload,
    fetchAllMarketplaceItemsEfficiently,
    getItemsByIds,
    getStoreItems,
    getItemReviewSummary,
    getItemReviews
} = require("../utils/playfab");
const {resolveTitle} = require("../utils/titles");
const {loadCreators, resolveCreatorId} = require("../utils/creators");
const {buildFilter} = require("../utils/filter");
const featuredServers = require("../config/featuredServers");
const logger = require("../config/logger");

const OS = process.env.OS || "iOS";
const PAGE_SIZE = 100;
const PROD_TITLE_ID = process.env.TITLE_ID || "20CA2";
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

async function searchLoop(titleId, {
    filter = "",
    orderBy = "creationDate desc",
    batch = 300,
    maxBatches = Number(process.env.MAX_SEARCH_BATCHES || 10)
}) {
    const out = [];
    for (let i = 0, skip = 0; i < maxBatches; i += 1, skip += batch) {
        const payload = buildSearchPayload({filter, search: "", top: batch, skip, orderBy});
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const items = (data.Items || []).filter(isValidItem).map(transformItem);
        if (!items.length) break;
        out.push(...items);
        if (items.length < batch) break;
    }
    return out;
}

async function searchLoopAllItems(titleId, {
    filter = "",
    orderBy = "creationDate desc",
    batch = 300,
    maxBatches = Number(process.env.MAX_SEARCH_BATCHES || 10)
}) {
    const out = [];
    for (let i = 0, skip = 0; i < maxBatches; i += 1, skip += batch) {
        const payload = buildSearchPayload({filter, search: "", top: batch, skip, orderBy});
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const itemsRaw = data.Items || [];
        out.push(...itemsRaw);
        if (!itemsRaw.length || itemsRaw.length < batch) break;
    }
    return out;
}

function getPrimaryTitleIdUnified() {
    const v = (process.env.FEATURED_PRIMARY_ALIAS || process.env.DEFAULT_ALIAS || "").trim();
    if (v) {
        try {
            const id = resolveTitle(v);
            return String(id);
        } catch {
            if (/^[A-Za-z0-9]{4,10}$/.test(v)) return v;
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
    const raw = data?.Stores || data?.data?.Stores || [];
    const stores = (raw || []).map(x => x?.Store || x).filter(Boolean);
    logger.debug(`[SearchStores] titleId=${titleId} storesRaw=${Array.isArray(raw) ? raw.length : 0} storesUnwrapped=${stores.length}`);
    for (const s of stores) {
        const sid = s?.Id || s?.id || "unknown";
        const stitle = s?.Title?.NEUTRAL || s?.Title?.neutral || s?.Name || "";
        const refs = Array.isArray(s?.ItemReferences) ? s.ItemReferences.length : 0;
        const dp = s?.DisplayProperties || {};
        logger.debug(`[SearchStores] store id=${sid} title="${stitle}" refs=${refs} discount=${typeof dp.discount === "number" ? dp.discount : "n/a"}`);
    }
    return stores;
}

async function fetchStoresWithItems(titleId) {
    const stores = await fetchStores(titleId);
    logger.debug(`[Sales] fetchStoresWithItems: stores=${Array.isArray(stores) ? stores.length : 0}`);
    if (!stores.length) return [];
    const tasks = [];
    for (let i = 0; i < stores.length; i += STORE_CONCURRENCY) {
        const chunk = stores.slice(i, i + STORE_CONCURRENCY);
        const res = await Promise.all(chunk.map(s => (async () => {
            const sid = s?.Id || s?.id || "unknown";
            const stitle = s?.Title?.NEUTRAL || s?.Title?.neutral || s?.Name || "";
            const refs = Array.isArray(s?.ItemReferences) ? s.ItemReferences.length : 0;
            const dp = s?.DisplayProperties || {};
            logger.debug(`[Sales] store meta id=${sid} title="${stitle}" refs=${refs} discount=${typeof dp.discount === "number" ? dp.discount : "n/a"}`);
            const r = await getStoreItems(titleId, sid, OS);
            const items = r?.Items || r?.items || [];
            logger.debug(`[PF] GetStoreItems result storeId=${sid} items=${items.length}`);
            return {Store: s, Items: items};
        })().catch(e => {
            const status = e?.status || e?.response?.status || 0;
            const msg = e?.response?.data?.error?.message || e?.message || "unknown";
            const isTransient = [429, 500, 502, 503, 504].includes(status);
            const level = isTransient ? "warn" : "debug";
            const sid = s?.Id || s?.id || "unknown";
            logger[level](`[Sales] getStoreItems caught storeId=${sid} status=${status || "ERR"} msg=${msg}`);
            return {Store: s, Items: []};
        })));
        tasks.push(...res);
    }
    logger.debug(`[Sales] fetchStoresWithItems: collected=${tasks.length}`);
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
            id: r.Id, prices: (r.Price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => ({
                currencyId: a.CurrencyId, amount: a.Amount
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
    return {totalItems, itemsPerCreator, sales};
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
        return {...it, ResolvedReferences: resolved};
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
            const amounts = (hit?.Price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => ({
                currencyId: a.CurrencyId,
                amount: a.Amount
            })));
            return {storeId: s.Id || s.id, storeTitle: s.Title || s.Name, amounts};
        }));
        for (const x of res) if (x && x.amounts && x.amounts.length) prices.push(x);
    }
    return prices;
}

async function enrichItemWithReviews(titleId, itemId, take = 10) {
    const summary = await getItemReviewSummary(titleId, itemId, OS);
    const reviews = await getItemReviews(titleId, itemId, take, 0, OS);
    return {summary: summary || {}, reviews: reviews?.Reviews || reviews?.reviews || []};
}

function parseExpand(expandParam) {
    const set = new Set(String(expandParam || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
    return {prices: set.has("prices"), reviews: set.has("reviews"), refs: set.has("refs") || set.has("references")};
}

function creatorMetaById(cid) {
    for (const c of creatorsArr) {
        if (String(c.id) === String(cid)) {
            return {id: c.id, displayName: c.displayName || c.creatorName || ""};
        }
    }
    return {id: cid, displayName: ""};
}

function summarizeItem(it) {
    const id = it.Id || it.id || "";
    const title = (it.Title && (it.Title.NEUTRAL || it.Title.neutral)) || "";
    const creatorName = (it.DisplayProperties && it.DisplayProperties.creatorName) || "";
    const startDate = it.StartDate || it.CreationDate || it.creationDate || null;
    const price = it.DisplayProperties && typeof it.DisplayProperties.price === "number" ? it.DisplayProperties.price : null;
    const contentType = it.ContentType || it.contentType || "";
    let thumbnail = null;
    if (Array.isArray(it.Images) && it.Images.length) {
        const th = it.Images.find(img => (img.Type || "").toLowerCase() === "thumbnail") || it.Images[0];
        if (th && th.Url) thumbnail = th.Url;
    }
    return {id, title, creatorName, startDate, price, contentType, thumbnail};
}

function ratingCountOf(it) {
    const r = it.Rating || it.rating || {};
    return r.totalcount || r.TotalCount || r.count || r.Count || 0;
}

function buildPriceBuckets(items) {
    const prices = [0, 310, 620, 990, 1990, 3990];
    const buckets = new Map();
    for (const it of items) {
        const p = it.DisplayProperties && typeof it.DisplayProperties.price === "number" ? it.DisplayProperties.price : null;
        if (typeof p !== "number") continue;
        let bucket = `${prices[0]}-${prices[1]}`;
        for (let i = 0; i < prices.length - 1; i++) {
            if (p >= prices[i] && p < prices[i + 1]) {
                bucket = `${prices[i]}-${prices[i + 1] - 1}`;
                break;
            }
            if (p >= prices[prices.length - 1]) bucket = `${prices[prices.length - 1]}+`;
        }
        buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }
    return Array.from(buckets.entries()).map(([bucket, count]) => ({bucket, count}));
}

function buildTypeCounts(items) {
    const map = new Map();
    for (const it of items) {
        const ct = it.ContentType || it.contentType || "";
        if (!ct) continue;
        map.set(ct, (map.get(ct) || 0) + 1);
    }
    return Array.from(map.entries()).map(([value, count]) => ({value, count})).sort((a, b) => b.count - a.count);
}

function buildOrClausesFromTags(tags) {
    if (!Array.isArray(tags) || !tags.length) return "";
    const parts = tags.slice(0, 5).map(t => `tags/any(t:t eq '${esc(t)}')`);
    if (parts.length === 1) return parts[0];
    return `(${parts.join(" or ")})`;
}

function buildRecommendationsFilter(base) {
    const cid = base.CreatorId || base.creatorId;
    if (cid) return `creatorId eq '${esc(cid)}'`;
    const name = base.DisplayProperties && base.DisplayProperties.creatorName ? String(base.DisplayProperties.creatorName) : "";
    if (name) {
        const normalized = name.replace(/\s/g, "").toLowerCase();
        const entry = creatorsByNormalized.get(normalized);
        if (entry && entry.id) return `creatorId eq '${esc(entry.id)}'`;
    }
    return "";
}

module.exports = {
    async fetchAll(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const tagClause = query.tag ? `tags/any(t:t eq '${String(query.tag).replace(/'/g, "''")}')` : "";
        const base = buildFilter({query}, creatorsArr);
        const filter = andFilter(base, tagClause);
        const list = await fetchAllMarketplaceItemsEfficiently(titleId, filter, OS, 300, 5);
        const enriched = await enrichWithFullItems(titleId, list);
        const withRefs = await enrichItemsWithResolvedReferences(titleId, enriched);
        return withRefs;
    },

    async fetchLatest(alias, count, query = {}) {
        const titleId = resolveTitle(alias);
        const filter = buildFilter({query}, creatorsArr);
        const payload = buildSearchPayload({
            filter, search: "", top: Math.min(Number(count) || 10, 50), skip: 0, orderBy: "creationDate desc"
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
            filter, search: `"${keyword}"`, top: PAGE_SIZE, skip: 0, orderBy: "creationDate desc"
        });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        let items = (data.Items || []).filter(isValidItem);
        items = await enrichWithFullItems(titleId, items);
        items = await enrichItemsWithResolvedReferences(titleId, items);
        return items.map(transformItem);
    },

    async fetchPopular(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const filter = buildFilter({query}, creatorsArr);
        let items = await searchLoop(titleId, {filter, orderBy: "rating/totalcount desc", batch: 300});
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
        const base = buildFilter({query}, creatorsArr);
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
        const reviews = expand.reviews ? await enrichItemWithReviews(titleId, itemId, 10) : {summary: {}, reviews: []};
        return {...withRefs[0], StorePrices: prices, Reviews: reviews};
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
        const entries = Object.entries(titlesMap).map(async ([alias, {id: titleId}]) => {
            const filter = `creatorId eq '${esc(cid)}'`;
            let items = await searchLoop(titleId, {filter, orderBy: "creationDate desc", batch: 300});
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
        const payload = buildSearchPayload({filter, search: "", top: 1, skip: 0});
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
        const payload = buildSearchPayload({filter, search: "", top: 1, skip: 0});
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
            return {name: s.name, id: s.id, items: it ? [it] : []};
        });
    },

    async fetchSales(query = {}, alias) {
        const titleId = alias ? resolveTitle(alias) : PROD_TITLE_ID;
        logger.debug(`[Sales] start titleId=${titleId}`);
        const storesWithItems = await fetchStoresWithItems(titleId);
        logger.debug(`[Sales] storesWithItems=${storesWithItems.length}`);
        if (!storesWithItems.length) return {totalItems: 0, itemsPerCreator: {}, sales: {}};

        const headers = storesWithItems.map(x => {
            const s = x.Store;
            if (!s.ItemReferences && Array.isArray(x.Items)) {
                s.ItemReferences = x.Items.map(i => ({
                    Id: i?.Item?.Id || i?.ItemId, Price: i?.Price
                })).filter(r => r.Id);
            }
            return toSaleHeader({Store: s});
        }).filter(h => h.id);

        logger.debug(`[Sales] headers=${headers.length}`);
        for (const h of headers) {
            const n = Array.isArray(h.itemRefs) ? h.itemRefs.length : 0;
            logger.debug(`[Sales] header.storeId=${h.id} itemRefs=${n} discount=${h.discountPercent ?? "null"}`);
        }

        const allIds = headers.flatMap(h => h.itemRefs.map(r => r.id));
        const unique = Array.from(new Set(allIds));
        logger.debug(`[Sales] uniqueItemIds=${unique.length}`);

        const details = unique.length ? await fetchItemsByIds(titleId, unique) : {};
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

        const result = buildSalesResponse(headers, details, creatorDisplayNameFilter);
        const saleKeys = Object.keys(result.sales || {});
        logger.debug(`[Sales] sales.buckets=${saleKeys.length} totalItems=${result.totalItems}`);
        for (const k of saleKeys) {
            const bucket = result.sales[k];
            const n = Array.isArray(bucket.items) ? bucket.items.length : 0;
            logger.debug(`[Sales] saleId=${k} items=${n} discount=${bucket.discountPercent ?? "null"}`);
        }
        return result;
    },

    async fetchStoreCollections(alias, storeIds = []) {
        const titleId = resolveTitle(alias);
        const arr = Array.isArray(storeIds) && storeIds.length ? storeIds : [];
        const stores = arr.length ? arr.map(id => ({Id: id})) : await fetchStores(titleId);
        const out = {};
        for (let i = 0; i < stores.length; i += STORE_CONCURRENCY) {
            const chunk = stores.slice(i, i + STORE_CONCURRENCY);
            const res = await Promise.all(chunk.map(s => getStoreItems(titleId, s.Id || s.id, OS)));
            for (let j = 0; j < chunk.length; j++) {
                const sid = chunk[j].Id || chunk[j].id;
                const items = (res[j].Items || res[j].items || []).map(it => ({
                    itemId: it?.Item?.Id || it?.ItemId,
                    prices: (it?.Price?.Prices || []).flatMap(p => (p.Amounts || []).map(a => ({
                        currencyId: a.CurrencyId,
                        amount: a.Amount
                    })))
                }));
                out[sid] = items;
            }
        }
        return out;
    },

    async getCreatorStats(creatorName) {
        const cid = resolveCreatorId(creatorsArr, creatorName);
        const meta = creatorMetaById(cid);
        const titleId = PROD_TITLE_ID;
        const filter = `creatorId eq '${esc(cid)}'`;

        const allItemsRaw = await searchLoopAllItems(titleId, {filter, orderBy: "creationDate desc", batch: 300});
        const totalItems = allItemsRaw.length;

        const latestSorted = allItemsRaw
            .slice()
            .sort((a, b) => {
                const da = new Date(a.StartDate || a.startDate || a.CreationDate || a.creationDate || 0).getTime();
                const db = new Date(b.StartDate || b.startDate || b.CreationDate || b.creationDate || 0).getTime();
                return db - da;
            });

        const latestItems = latestSorted.slice(0, 5).map(summarizeItem);

        const topRatedSorted = allItemsRaw.slice().sort((a, b) => ratingCountOf(b) - ratingCountOf(a));
        const topRatedItems = topRatedSorted.slice(0, 5).map(summarizeItem);

        const priceDistribution = buildPriceBuckets(allItemsRaw);
        const contentTypes = buildTypeCounts(allItemsRaw);

        return {
            creator: {
                id: meta.id, displayName: meta.displayName, totalItems
            }, latestItems, topRatedItems, priceDistribution, contentTypes
        };
    },

    async getRecommendations(itemId, limit) {
        const titleId = PROD_TITLE_ID;
        const baseRaw = await getItemsByIds(titleId, [itemId], OS, ENRICH_BATCH, ENRICH_CONCURRENCY);
        if (!baseRaw.length) {
            const e = new Error("Item nicht gefunden.");
            e.status = 404;
            throw e;
        }
        const base = baseRaw[0];
        const filter = buildRecommendationsFilter(base);
        if (!filter) {
            return {items: []};
        }
        const payload = buildSearchPayload({
            filter, search: "", top: 200, skip: 0, orderBy: "creationDate desc"
        });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const candidates = (data.Items || [])
            .filter(isValidItem)
            .map(transformItem);

        const baseType = base.ContentType || base.contentType || "";
        const seen = new Set();
        const scored = [];

        for (const it of candidates) {
            const id = it.Id || it.id;
            if (!id || id === itemId) continue;
            if (seen.has(id)) continue;
            seen.add(id);

            const createdAtStr = it.StartDate || it.CreationDate || it.creationDate || it.startDate;
            const createdAt = createdAtStr ? new Date(createdAtStr).getTime() : 0;
            const ageDays = createdAt ? (Date.now() - createdAt) / 86400000 : 9999;

            const rc = ratingCountOf(it);
            const sameType = (it.ContentType || it.contentType || "") === baseType;

            const price = it.DisplayProperties && typeof it.DisplayProperties.price === "number" ? it.DisplayProperties.price : null;
            const isFree = price === 0;

            const freshnessBoost = Math.max(0, 60 - ageDays);

            let score = rc * 2 + freshnessBoost;
            if (sameType) score += 50;
            if (isFree) score -= 5;

            scored.push({it, score});
        }

        scored.sort((a, b) => b.score - a.score);

        const out = scored
            .slice(0, Math.max(1, limit || 10))
            .map(s => summarizeItem(s.it));

        return {items: out};
    }
};
