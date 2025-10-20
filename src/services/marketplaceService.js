const { sendPlayFabRequest, isValidItem, transformItem, buildSearchPayload, fetchAllMarketplaceItemsEfficiently } = require("../utils/playfab");
const { resolveTitle } = require("../utils/titles");
const { loadCreators, resolveCreatorId } = require("../utils/creators");
const { buildFilter } = require("../utils/filter");
const featuredServers = require("../config/featuredServers");

const OS = process.env.OS || "iOS";
const PAGE_SIZE = 100;
const PROD_TITLE_ID = (process.env.TITLE_ID || "20CA2").toLowerCase();

const creatorsArr = loadCreators();
const creatorsByNormalized = new Map(creatorsArr.map(c => [String(c.creatorName).replace(/\s/g, "").toLowerCase(), c]));
const titlesMap = require("../utils/titles").loadTitles();

function andFilter(a, b) {
    const A = (a || "").trim();
    const B = (b || "").trim();
    if (A && B) return `(${A}) and (${B})`;
    return A || B || "";
}

async function searchLoop(titleId, { filter = "", orderBy = "creationDate desc", batch = 300 }) {
    const out = [];
    for (let skip = 0; ; skip += batch) {
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

async function fetchItemsByIds(titleId, ids) {
    const details = {};
    const list = Array.from(new Set(ids));
    const chunk = 50;
    for (let i = 0; i < list.length; i += chunk) {
        const slice = list.slice(i, i + chunk);
        const filter = slice.map(id => `id eq '${esc(id)}'`).join(" or ");
        const payload = buildSearchPayload({
            filter,
            search: "",
            top: slice.length,
            skip: 0,
            orderBy: "creationDate desc",
            selectFields: "images,Description,Title,Tags,Platforms,ContentType,Keywords,CustomData,DisplayProperties",
            expandFields: "images"
        });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 2, OS);
        const items = data.Items || [];
        for (const it of items) details[it.Id] = it;
    }
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

module.exports = {
    async fetchAll(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const tagClause = query.tag ? `tags/any(t:t eq '${String(query.tag).replace(/'/g, "''")}')` : "";
        const base = buildFilter({ query }, creatorsArr);
        const filter = andFilter(base, tagClause);
        return fetchAllMarketplaceItemsEfficiently(titleId, filter, OS, 300, 5);
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
        return (data.Items || []).filter(isValidItem).map(transformItem);
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
        return (data.Items || []).filter(isValidItem).map(transformItem);
    },

    async fetchPopular(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const filter = buildFilter({ query }, creatorsArr);
        return searchLoop(titleId, { filter, orderBy: "rating/totalcount desc", batch: 300 });
    },

    async fetchByTag(alias, tag) {
        const titleId = resolveTitle(alias);
        const tagClause = `tags/any(t:t eq '${String(tag).replace(/'/g, "''")}')`;
        return fetchAllMarketplaceItemsEfficiently(titleId, tagClause, OS, 300, 5);
    },

    async fetchFree(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const base = buildFilter({ query }, creatorsArr);
        const freeClause = "displayProperties/price eq 0";
        const filter = andFilter(base, freeClause);
        return fetchAllMarketplaceItemsEfficiently(titleId, filter, OS, 300, 5);
    },

    async fetchDetails(alias, itemId) {
        const titleId = resolveTitle(alias);
        const payload = buildSearchPayload({
            filter: `id eq '${String(itemId).replace(/'/g, "''")}'`,
            search: "",
            top: 1,
            skip: 0,
            orderBy: "creationDate desc"
        });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const items = (data.Items || []).filter(isValidItem).map(transformItem);
        if (!items.length) {
            const e = new Error("Item nicht gefunden.");
            e.status = 404;
            throw e;
        }
        return items[0];
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
            const items = await searchLoop(titleId, { filter, orderBy: "creationDate desc", batch: 300 });
            return [alias, items];
        });
        return Object.fromEntries(await Promise.all(entries));
    },

    async resolveByItemId(alias, itemId) {
        const titleId = resolveTitle(alias);
        const payload = buildSearchPayload({ filter: `id eq '${String(itemId).replace(/'/g, "''")}'`, search: "", top: 1, skip: 0 });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const items = (data.Items || []).filter(isValidItem).map(transformItem);
        if (!items.length) {
            const e = new Error("Item nicht gefunden.");
            e.status = 404;
            throw e;
        }
        return items[0];
    },

    async resolveByFriendly(alias, friendlyId) {
        const titleId = resolveTitle(alias);
        const filter = `alternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq '${String(friendlyId).replace(/'/g, "''")}')`;
        const payload = buildSearchPayload({ filter, search: "", top: 1, skip: 0 });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const items = (data.Items || []).filter(isValidItem).map(transformItem);
        if (!items.length) {
            const e = new Error(`Kein Item mit FriendlyId ${friendlyId} gefunden.`);
            e.status = 404;
            throw e;
        }
        return items[0];
    },

    async fetchByFriendly(alias, friendlyId) {
        const titleId = resolveTitle(alias);
        const filter = `alternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq '${String(friendlyId).replace(/'/g, "''")}')`;
        const payload = buildSearchPayload({ filter, search: "", top: 1, skip: 0 });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const items = (data.Items || []).filter(isValidItem).map(transformItem);
        if (!items.length) {
            const e = new Error(`No item with the FriendlyId ${friendlyId} has been found`);
            e.status = 404;
            throw e;
        }
        return items[0];
    },

    async fetchFeaturedServers() {
        const titleId = getPrimaryTitleIdUnified();
        const ids = featuredServers.map(s => s.id);
        const filter = ids.map(id => `id eq '${esc(id)}'`).join(" or ");
        const payload = buildSearchPayload({
            filter,
            search: "",
            top: Math.max(ids.length, 50),
            skip: 0,
            orderBy: "creationDate desc",
            selectFields: "id,title,displayProperties,images,startDate,creationDate,alternateIds",
            expandFields: "images"
        });
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 2, OS);
        const arr = (data.Items || []).filter(isValidItem);
        const byId = new Map(arr.map(raw => {
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
        const stores = await fetchStores(titleId);
        if (!stores.length) return { totalItems: 0, itemsPerCreator: {}, sales: {} };
        const headers = stores.map(toSaleHeader).filter(h => h.id);
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
    }
};
