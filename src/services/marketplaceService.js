const {
    sendPlayFabRequest,
    isValidItem,
    transformItem,
    buildSearchPayload,
    fetchAllMarketplaceItemsEfficiently
} = require("../utils/playfab");
const { resolveTitle } = require("../utils/titles");
const { loadCreators, resolveCreatorId } = require("../utils/creators");
const { buildFilter } = require("../utils/filter");
const featuredServers = require("../config/featuredServers");

const OS = process.env.OS;
const PAGE_SIZE = 100;

const creators = loadCreators();
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

function getPrimaryTitleId() {
    const preferAlias = process.env.FEATURED_PRIMARY_ALIAS;
    if (!preferAlias || !titlesMap[preferAlias]) {
        const e = new Error("FEATURED_PRIMARY_ALIAS not set or unknown.");
        e.status = 400;
        throw e;
    }
    return titlesMap[preferAlias].id;
}

function esc(v) {
    return String(v).replace(/'/g, "''");
}

module.exports = {
    async fetchAll(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const tagClause = query.tag ? `tags/any(t:t eq '${String(query.tag).replace(/'/g,"''")}')` : "";
        const base = buildFilter({ query }, creators);
        const filter = andFilter(base, tagClause);
        return fetchAllMarketplaceItemsEfficiently(titleId, filter, OS, 300, 5);
    },

    async fetchLatest(alias, count, query = {}) {
        const titleId = resolveTitle(alias);
        const filter = buildFilter({ query }, creators);
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
        const cid = resolveCreatorId(creators, creatorName);
        const filter = `creatorId eq '${cid.replace(/'/g,"''")}'`;
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
        const filter = buildFilter({ query }, creators);
        return searchLoop(titleId, { filter, orderBy: "rating/totalcount desc", batch: 300 });
    },

    async fetchByTag(alias, tag) {
        const titleId = resolveTitle(alias);
        const tagClause = `tags/any(t:t eq '${String(tag).replace(/'/g,"''")}')`;
        return fetchAllMarketplaceItemsEfficiently(titleId, tagClause, OS, 300, 5);
    },

    async fetchFree(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const base = buildFilter({ query }, creators);
        const freeClause = "displayProperties/price eq 0";
        const filter = andFilter(base, freeClause);
        return fetchAllMarketplaceItemsEfficiently(titleId, filter, OS, 300, 5);
    },

    async fetchDetails(alias, itemId) {
        const titleId = resolveTitle(alias);
        const payload = buildSearchPayload({
            filter: `id eq '${String(itemId).replace(/'/g,"''")}'`,
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
        const cid = resolveCreatorId(creators, creatorName);
        const entries = Object.entries(titlesMap).map(async ([alias, { id: titleId }]) => {
            const filter = `creatorId eq '${cid.replace(/'/g,"''")}'`;
            const items = await searchLoop(titleId, { filter, orderBy: "creationDate desc", batch: 300 });
            return [alias, items];
        });
        return Object.fromEntries(await Promise.all(entries));
    },

    async resolveByItemId(alias, itemId) {
        const titleId = resolveTitle(alias);
        const payload = buildSearchPayload({
            filter: `id eq '${String(itemId).replace(/'/g,"''")}'`,
            search: "",
            top: 1,
            skip: 0
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

    async resolveByFriendly(alias, friendlyId) {
        const titleId = resolveTitle(alias);
        const filter = `alternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq '${String(friendlyId).replace(/'/g,"''")}')`;
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
        const filter = `alternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq '${String(friendlyId).replace(/'/g,"''")}')`;
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
        const titleId = getPrimaryTitleId();
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
    }
};
