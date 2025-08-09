const {
    sendPlayFabRequest,
    isValidItem,
    transformItem,
    buildSearchPayload
} = require("../utils/playfab");
const { resolveTitle } = require("../utils/titles");
const { loadCreators, resolveCreatorId } = require("../utils/creators");
const { buildFilter } = require("../utils/filter");
const logger = require("../config/logger");
const { LRUCache } = require("lru-cache");

const OS = process.env.OS;
const PAGE_SIZE = 100;

const IDS_CACHE_TTL_MS = 60_000;
const IDS_SWR_MS = 180_000;
const ITEM_CACHE_TTL_MS = 300_000;

const creators = loadCreators();
const titlesMap = require("../utils/titles").loadTitles();

const capabilities = new LRUCache({ max: 200, ttl: 60 * 60 * 1000 });
const searchIdsCache = new LRUCache({ max: 2000, ttl: IDS_CACHE_TTL_MS + IDS_SWR_MS, allowStale: true });
const itemCache = new LRUCache({ max: 5000, ttl: ITEM_CACHE_TTL_MS });

const now = () => Date.now();

function safeFilter(input) {
    if (input == null) return undefined;
    const s = String(input).trim();
    return s ? s : undefined;
}

function andFilter(a, b) {
    const A = safeFilter(a);
    const B = safeFilter(b);
    if (A && B) return `(${A}) and (${B})`;
    return A || B || undefined;
}

function makeSearchPayload(opts) {
    const { filter, continuationToken, ...rest } = opts || {};
    const f = safeFilter(filter);
    const base = f ? { ...rest, filter: f } : { ...rest };
    if (continuationToken) base.continuationToken = continuationToken;
    return buildSearchPayload(base);
}

function cacheGet(map, key) {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expires > now()) return entry;
    if (entry.swrUntil && entry.swrUntil > now()) return entry;
    return null;
}

function cacheSet(map, key, value, ttl = IDS_CACHE_TTL_MS, swr = IDS_SWR_MS) {
    const obj = {
        value,
        expires: now() + ttl,
        swrUntil: now() + ttl + swr
    };
    map.set(key, obj, { ttl: ttl + swr });
}

function stableKey(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
}

async function tryGetCatalogItems(titleId) {
    const cached = capabilities.get(titleId);
    if (cached?.hasGetCatalogItems === false) return null;

    try {
        const resp = await sendPlayFabRequest(
            titleId,
            "Catalog/GetCatalogItems",
            {},
            "X-EntityToken",
            3,
            OS
        );
        capabilities.set(titleId, { hasGetCatalogItems: true });
        return resp;
    } catch (err) {
        const status = err.status || err.response?.status;
        if (status === 404) {
            logger.info(`GetCatalogItems nicht verfügbar für Title=${titleId}. Nutze dauerhaft paginiertes Search.`);
            capabilities.set(titleId, { hasGetCatalogItems: false });
            return null;
        }
        throw err;
    }
}

async function fetchFullItems(titleId, ids) {
    const unique = Array.from(new Set(ids));

    const hits = [];
    const misses = [];

    for (const id of unique) {
        const c = itemCache.get(id);
        if (c) {
            hits.push(c);
        } else {
            misses.push(id);
        }
    }

    if (misses.length === 0) {
        return hits;
    }

    const chunks = [];
    for (let i = 0; i < misses.length; i += PAGE_SIZE) {
        chunks.push(misses.slice(i, i + PAGE_SIZE));
    }

    const CONCURRENCY = 15;
    const fetched = [];

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const slice = chunks.slice(i, i + CONCURRENCY);
        const responses = await Promise.all(
            slice.map(chunk =>
                sendPlayFabRequest(
                    titleId,
                    "Catalog/GetItems",
                    { Ids: chunk },
                    "X-EntityToken",
                    3,
                    OS
                )
            )
        );
        for (const r of responses) {
            const items = r.Items || [];
            for (const it of items) {
                itemCache.set(it.Id, it, { ttl: ITEM_CACHE_TTL_MS });
            }
            fetched.push(...items);
        }
    }

    return [...hits, ...fetched];
}

async function searchPagedIdsSkipOrToken(titleId, {
    filter,
    search = "",
    orderBy,
    top = PAGE_SIZE,
    initialSkip = 0,
    maxPages = 2000,
    endpoint = "Catalog/Search"
}) {
    const ids = [];
    let skip = initialSkip;
    let page = 0;
    let continuationToken = undefined;
    let totalCount = undefined;
    let pagingNoted = false;

    while (page < maxPages) {
        const payload = makeSearchPayload({
            filter,
            search,
            top,
            orderBy,
            skip: continuationToken ? undefined : skip,
            continuationToken
        });

        let resp;
        try {
            resp = await sendPlayFabRequest(
                titleId,
                endpoint,
                payload,
                "X-EntityToken",
                3,
                OS
            );
        } catch (err) {
            const status = err.status || err.response?.status;
            if (status === 400) {
                if (!pagingNoted) {
                    logger.info(`Paging bei ${endpoint} beendet (400 bei skip=${skip}, page=${page}).`);
                    pagingNoted = true;
                }
                break;
            }
            throw err;
        }

        const items = resp.Items || [];
        for (const it of items) ids.push(it.Id);

        totalCount = typeof resp.TotalCount === "number" ? resp.TotalCount : totalCount;
        continuationToken = resp.ContinuationToken || resp.continuationToken || undefined;

        if (items.length === 0) break;
        if (!continuationToken && items.length < top) break;
        if (typeof totalCount === "number" && ids.length >= totalCount) break;

        if (!continuationToken) skip += top;
        page += 1;
    }

    return ids;
}

async function searchPagedIdsKeysetById(titleId, {
    baseFilter,
    search = "",
    top = PAGE_SIZE,
    endpoint = "Catalog/Search",
    maxPages = 500000
}) {
    const ids = [];
    let lastId = "";
    let page = 0;

    while (page < maxPages) {
        const pageFilter = andFilter(baseFilter, lastId ? `Id gt '${lastId.replace(/'/g, "''")}'` : undefined);

        const payload = makeSearchPayload({
            filter: pageFilter,
            search,
            top,
            skip: 0,
            orderBy: "id asc"
        });

        const resp = await sendPlayFabRequest(
            titleId,
            endpoint,
            payload,
            "X-EntityToken",
            3,
            OS
        );

        const items = resp.Items || [];
        if (items.length === 0) break;

        for (const it of items) ids.push(it.Id);

        lastId = items[items.length - 1].Id;
        page += 1;

        if (items.length < top) break;
    }

    return ids;
}

async function getIdsWithCache(cacheKey, fetcher) {
    const entry = cacheGet(searchIdsCache, cacheKey);
    if (entry) {
        const result = entry.value;

        if (entry.expires <= now() && (!entry.refresh || entry.refreshSettled)) {
            const p = (async () => {
                try {
                    const fresh = await fetcher();
                    cacheSet(searchIdsCache, cacheKey, fresh);
                } catch (e) {
                } finally {
                    entry.refreshSettled = true;
                }
            })();
            entry.refresh = p;
        }

        return result;
    }

    const fresh = await fetcher();
    cacheSet(searchIdsCache, cacheKey, fresh);
    return fresh;
}

module.exports = {
    async fetchAll(alias, query = {}) {
        const titleId = resolveTitle(alias);

        if (!query.tag && Object.keys(query).length === 0) {
            const allResp = await tryGetCatalogItems(titleId);
            if (allResp) {
                return (allResp.Items || [])
                    .filter(isValidItem)
                    .map(transformItem);
            }
        }

        const extra = query.tag
            ? `Tags/any(t:t eq '${query.tag.replace(/'/g, "''")}')`
            : "";

        const baseFilter = buildFilter({ query }, creators, extra)
            .replace(/\bcreatorId\b/g, "CreatorId");

        const hasCreator = /\bCreatorId\s+eq\s+'/.test(baseFilter || "");

        const cacheKey = stableKey({
            titleId,
            endpoint: "Catalog/Search",
            mode: hasCreator ? "skipOrToken" : "keysetById",
            baseFilter: baseFilter || "",
            tag: query.tag || "",
            pageSize: PAGE_SIZE
        });

        const allIds = await getIdsWithCache(cacheKey, async () => {
            if (!hasCreator) {
                return searchPagedIdsKeysetById(titleId, {
                    baseFilter,
                    search: "",
                    top: PAGE_SIZE,
                    endpoint: "Catalog/Search"
                });
            } else {
                return searchPagedIdsSkipOrToken(titleId, {
                    filter: baseFilter,
                    search: "",
                    orderBy: "creationDate desc",
                    top: PAGE_SIZE,
                    initialSkip: 0,
                    endpoint: "Catalog/Search"
                });
            }
        });

        if (!allIds || allIds.length === 0) return [];

        const rawItems = await fetchFullItems(titleId, allIds);
        return rawItems.filter(isValidItem).map(transformItem);
    },

    async fetchLatest(alias, count, query = {}) {
        const titleId = resolveTitle(alias);

        const filter = buildFilter({ query }, creators)
            .replace(/\bcreatorId\b/g, "CreatorId");

        const cacheKey = stableKey({
            titleId,
            endpoint: "Catalog/SearchItems",
            mode: "latest",
            filter: filter || "",
            count
        });

        const ids = await getIdsWithCache(cacheKey, async () => {
            const payload = makeSearchPayload({
                filter,
                search: "",
                top: count,
                skip: 0,
                orderBy: "creationDate desc"
            });

            const data = await sendPlayFabRequest(
                titleId,
                "Catalog/SearchItems",
                payload,
                "X-EntityToken",
                3,
                OS
            );

            return (data.Items || []).map(i => i.Id);
        });

        if (ids.length === 0) return [];

        const rawItems = await fetchFullItems(titleId, ids);
        return rawItems.filter(isValidItem).map(transformItem);
    },

    async search(alias, creatorName, keyword) {
        const titleId = resolveTitle(alias);
        const cid = resolveCreatorId(creators, creatorName);
        const filter = `CreatorId eq '${cid.replace(/'/g, "''")}'`;

        const cacheKey = stableKey({
            titleId,
            endpoint: "Catalog/SearchItems",
            mode: "creatorSearch",
            filter,
            keyword,
            top: PAGE_SIZE
        });

        const ids = await getIdsWithCache(cacheKey, async () => {
            const payload = makeSearchPayload({
                filter,
                search: `"${keyword}"`,
                top: PAGE_SIZE,
                skip: 0
            });

            const data = await sendPlayFabRequest(
                titleId,
                "Catalog/SearchItems",
                payload,
                "X-EntityToken",
                3,
                OS
            );

            return (data.Items || []).map(i => i.Id);
        });

        if (ids.length === 0) return [];

        const rawItems = await fetchFullItems(titleId, ids);
        return rawItems.filter(isValidItem).map(transformItem);
    },

    async fetchPopular(alias, query = {}) {
        const titleId = resolveTitle(alias);

        const filter = buildFilter({ query }, creators)
            .replace(/\bcreatorId\b/g, "CreatorId");

        const cacheKey = stableKey({
            titleId,
            endpoint: "Catalog/SearchItems",
            mode: "popular-paged",
            filter: filter || "",
            pageSize: PAGE_SIZE
        });

        const ids = await getIdsWithCache(cacheKey, async () => {
            return searchPagedIdsSkipOrToken(titleId, {
                filter,
                search: "",
                orderBy: "rating/totalcount desc",
                top: PAGE_SIZE,
                initialSkip: 0,
                endpoint: "Catalog/SearchItems"
            });
        });

        if (ids.length === 0) return [];

        const rawItems = await fetchFullItems(titleId, ids);
        return rawItems.filter(isValidItem).map(transformItem);
    },

    async fetchByTag(alias, tag) {
        const titleId = resolveTitle(alias);

        const filter = buildFilter(
            { query: {} },
            creators,
            `Tags/any(t:t eq '${tag.replace(/'/g, "''")}')`
        ).replace(/\bcreatorId\b/g, "CreatorId");

        const cacheKey = stableKey({
            titleId,
            endpoint: "Catalog/SearchItems",
            mode: "byTag",
            filter,
            tag,
            top: 300
        });

        const ids = await getIdsWithCache(cacheKey, async () => {
            const payload = makeSearchPayload({
                filter,
                search: "",
                top: 300,
                skip: 0
            });

            const data = await sendPlayFabRequest(
                titleId,
                "Catalog/SearchItems",
                payload,
                "X-EntityToken",
                3,
                OS
            );

            return (data.Items || []).map(i => i.Id);
        });

        if (ids.length === 0) return [];

        const rawItems = await fetchFullItems(titleId, ids);
        return rawItems.filter(isValidItem).map(transformItem);
    },

    async fetchFree(alias, query = {}) {
        const titleId = resolveTitle(alias);
        const baseFilterInput = buildFilter({ query }, creators);
        const freeClause = "DisplayProperties/price eq 0";
        const combined = andFilter(baseFilterInput, freeClause).replace(/\bcreatorId\b/g, "CreatorId");
        const hasCreator = /\bCreatorId\s+eq\s+'/.test(combined || "");

        const cacheKey = stableKey({
            titleId,
            endpoint: hasCreator ? "Catalog/SearchItems" : "Catalog/Search",
            mode: hasCreator ? "free-with-creator" : "free-all-keyset",
            filter: combined || "",
            pageSize: PAGE_SIZE
        });

        const ids = await getIdsWithCache(cacheKey, async () => {
            if (!hasCreator) {
                return searchPagedIdsKeysetById(titleId, {
                    baseFilter: combined,
                    search: "",
                    top: PAGE_SIZE,
                    endpoint: "Catalog/Search"
                });
            } else {
                return searchPagedIdsSkipOrToken(titleId, {
                    filter: combined,
                    search: "",
                    orderBy: "creationDate desc",
                    top: PAGE_SIZE,
                    initialSkip: 0,
                    endpoint: "Catalog/SearchItems"
                });
            }
        });

        if (ids.length === 0) return [];

        const rawItems = await fetchFullItems(titleId, ids);
        return rawItems.filter(isValidItem).map(transformItem);
    },

    async fetchDetails(alias, itemId) {
        const titleId = resolveTitle(alias);

        const payload = makeSearchPayload({
            filter: `Id eq '${itemId.replace(/'/g, "''")}'`,
            search: "",
            top: 1,
            skip: 0,
            orderBy: "creationDate desc"
        });

        const data = await sendPlayFabRequest(
            titleId,
            "Catalog/SearchItems",
            payload,
            "X-EntityToken",
            3,
            OS
        );

        const ids = (data.Items || []).filter(isValidItem).map(i => i.Id);
        if (ids.length === 0) {
            const e = new Error("Item nicht gefunden.");
            e.status = 404;
            throw e;
        }

        const rawItems = await fetchFullItems(titleId, ids);
        const item = rawItems.find(isValidItem);
        return transformItem(item);
    },

    async fetchFeaturedServers() {
        const featured = require("../config/featuredServers");
        const titleId = resolveTitle("prod");

        const results = await Promise.all(
            featured.map(async srv => {
                const cacheKey = stableKey({
                    titleId,
                    endpoint: "Catalog/SearchItems",
                    mode: "featured",
                    id: srv.id
                });

                const ids = await getIdsWithCache(cacheKey, async () => {
                    const payload = makeSearchPayload({
                        filter: `Id eq '${srv.id.replace(/'/g, "''")}'`,
                        search: "",
                        top: 1,
                        skip: 0
                    });

                    const data = await sendPlayFabRequest(
                        titleId,
                        "Catalog/SearchItems",
                        payload,
                        "X-EntityToken",
                        3,
                        OS
                    );

                    return (data.Items || []).map(i => i.Id);
                });

                let item = null, images = [];
                if (ids.length > 0) {
                    const raw = await fetchFullItems(titleId, ids);
                    item = raw.find(isValidItem) || null;
                    images = item ? item.Images : [];
                }
                return {
                    name: srv.name,
                    id: srv.id,
                    data: item,
                    images,
                    screenshots: images.filter(i => i.Tag.toLowerCase() !== "thumbnail")
                };
            })
        );

        return results;
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
            const filter = `CreatorId eq '${cid.replace(/'/g, "''")}'`;

            const cacheKey = stableKey({
                titleId,
                endpoint: "Catalog/SearchItems",
                mode: "compareByCreator",
                filter,
                top: 10000
            });

            const ids = await getIdsWithCache(cacheKey, async () => {
                const payload = makeSearchPayload({
                    filter,
                    search: "",
                    top: 10000,
                    skip: 0,
                    orderBy: "creationDate desc"
                });
                const data = await sendPlayFabRequest(
                    titleId,
                    "Catalog/SearchItems",
                    payload,
                    "X-EntityToken",
                    3,
                    OS
                );
                return (data.Items || []).map(i => i.Id);
            });

            const items = ids.length
                ? (await fetchFullItems(titleId, ids)).filter(isValidItem).map(transformItem)
                : [];

            return [alias, items];
        });

        return Object.fromEntries(await Promise.all(entries));
    },

    async fetchByFriendly(alias, friendlyId) {
        const titleId = resolveTitle(alias);
        const filter = `AlternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq '${friendlyId.replace(/'/g, "''")}')`;

        const cacheKey = stableKey({
            titleId,
            endpoint: "Catalog/SearchItems",
            mode: "byFriendly",
            filter,
            top: 1
        });

        const ids = await getIdsWithCache(cacheKey, async () => {
            const payload = makeSearchPayload({
                filter,
                search: "",
                top: 1,
                skip: 0
            });

            const data = await sendPlayFabRequest(
                titleId,
                "Catalog/SearchItems",
                payload,
                "X-EntityToken",
                3,
                OS
            );

            return (data.Items || []).map(i => i.Id);
        });

        if (ids.length === 0) {
            const e = new Error(`Keine Item mit FriendlyId ${friendlyId}`);
            e.status = 404;
            throw e;
        }

        const rawItems = await fetchFullItems(titleId, ids);
        const item = rawItems.find(isValidItem);
        if (!item) {
            const e = new Error(`Keine gültige Item mit FriendlyId ${friendlyId}`);
            e.status = 404;
            throw e;
        }
        return transformItem(item);
    }
};
