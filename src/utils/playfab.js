// -----------------------------------------------------------------------------
//
// File: src/utils/playfab.js
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

const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const {Mutex} = require("async-mutex");
const stringify = require("fast-json-stable-stringify");
const {sessionCache, dataCache} = require("../config/cache");
const logger = require("../config/logger");
const {upstreamGuard} = require("../services/playfabUpstreamGuard");
const {sanitizeCatalogItem} = require("./catalogSanitizer");

const httpAgent = new http.Agent({
    keepAlive: true, maxSockets: Number(process.env.HTTP_MAX_SOCKETS || 512), keepAliveMsecs: 60000, scheduling: "lifo"
});

const httpsAgent = new https.Agent({
    keepAlive: true, maxSockets: Number(process.env.HTTPS_MAX_SOCKETS || 512), keepAliveMsecs: 60000, scheduling: "lifo"
});

const api = axios.create({
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 20000), httpAgent, httpsAgent, headers: {
        "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "ViewMarketplace/optimized"
    }, validateStatus: () => true
});

const sessionMutexes = new Map();
const SESSION_FALLBACK_TTL_MS = Math.max(1000, Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000));
const SESSION_EXPIRY_SKEW_MS = Math.max(0, Number(process.env.SESSION_EXPIRY_SKEW_MS || 60 * 1000));
const fallbackDeviceId = `vmc-${crypto.randomBytes(16).toString("hex")}`;
const DEFAULT_DEVICE_ID_FILE = path.join(__dirname, "../data/playfabDeviceId.json");
const UPSTREAM_RESPONSE_CACHE_TTL_MS = Math.max(1000, Number(process.env.UPSTREAM_RESPONSE_CACHE_TTL_MS || 45000));
const UPSTREAM_CACHEABLE_ENDPOINTS = new Set(["Catalog/Search", "Catalog/SearchItems", "Catalog/GetItems", "Catalog/SearchStores", "Catalog/GetStoreItems"]);
const ITEM_BY_ID_CACHE_TTL_MS = Math.max(1000, Number(process.env.ITEM_BY_ID_CACHE_TTL_MS || 5 * 60 * 1000));
const GET_ITEMS_MAX_IDS = 50;
const CATALOG_SEARCH_MAX_SKIP = 10000;
const CATALOG_SEARCH_UNKNOWN_TOTAL_MAX_BATCHES = Math.max(
    1,
    parseInt(process.env.CATALOG_SEARCH_UNKNOWN_TOTAL_MAX_BATCHES || "1000", 10)
);

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function parseRetryAfter(h) {
    if (!h) return null;
    const n = Number(h);
    if (!Number.isNaN(n)) return Math.max(0, Math.floor(n * 1000));
    return 3000;
}

function jitter(base, attempt, max) {
    const exp = Math.min(max, Math.pow(2, attempt) * base);
    return Math.floor(Math.random() * exp);
}

function retryDelayForStatus(status, headers = {}, attempt = 0) {
    const retryAfter = parseRetryAfter(headers?.["retry-after"]);
    if (retryAfter !== null && (status === 429 || status === 503)) return retryAfter;
    if (status === 503) return 500 + jitter(1000, attempt, 15000);
    return jitter(200, attempt, 10000);
}

function readPersistentPlayFabDeviceId(filePath) {
    if (!fs.existsSync(filePath)) return "";
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return typeof parsed?.deviceId === "string" ? parsed.deviceId.trim() : "";
}

function resolvePersistentPlayFabDeviceId(filePath = DEFAULT_DEVICE_ID_FILE) {
    const existing = readPersistentPlayFabDeviceId(filePath);
    if (existing) return existing;

    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    try {
        fs.writeFileSync(filePath, `${JSON.stringify({deviceId: fallbackDeviceId}, null, 2)}\n`, {
            encoding: "utf8",
            flag: "wx",
            mode: 0o600
        });
        return fallbackDeviceId;
    } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const racedValue = readPersistentPlayFabDeviceId(filePath);
        if (racedValue) return racedValue;
        throw error;
    }
}

function resolvePlayFabDeviceId(env = process.env, options = {}) {
    const configured = typeof env.PLAYFAB_DEVICE_ID === "string" ? env.PLAYFAB_DEVICE_ID.trim() : "";
    if (configured) return configured;
    if (String(env.NODE_ENV || "").trim().toLowerCase() !== "production") return fallbackDeviceId;
    try {
        return resolvePersistentPlayFabDeviceId(options.deviceIdFile);
    } catch (error) {
        logger.warn(`[PF] could not persist PLAYFAB_DEVICE_ID: ${error.message}; using process-local fallback`);
        return fallbackDeviceId;
    }
}

function resolveSessionExpiresAt(tokenExpiration, now = Date.now()) {
    const tokenExpiresAt = Date.parse(tokenExpiration || "");
    if (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= now) return now + SESSION_FALLBACK_TTL_MS;
    // Refresh shortly before PlayFab rejects the token.
    const refreshSkew = Math.min(SESSION_EXPIRY_SKEW_MS, Math.floor((tokenExpiresAt - now) / 2));
    return tokenExpiresAt - refreshSkew;
}

function isRetryableUpstreamStatus(status, includeUnauthorized = false) {
    const retryable = [408, 409, 425, 429, 500, 502, 503, 504];
    if (includeUnauthorized) retryable.push(401);
    return retryable.includes(status);
}

async function loginWithIOSDeviceID(titleId, os, requestOptions = {}) {
    const deviceId = resolvePlayFabDeviceId();
    const r = await upstreamGuard.schedule(titleId, "Client/LoginWithIOSDeviceID", () => api.post(`https://${titleId}.playfabapi.com/Client/LoginWithIOSDeviceID`, {
        CreateAccount: true, TitleId: titleId, DeviceId: deviceId, OS: os
    }), requestOptions);
    if (r.status >= 200 && r.status < 300) return r.data.data;
    const e = new Error("Login failed");
    e.status = r.status;
    throw e;
}

async function requestEntityToken(titleId, ticket, pfId, requestOptions = {}) {
    const r = await upstreamGuard.schedule(titleId, "Authentication/GetEntityToken", () => api.post(`https://${titleId}.playfabapi.com/Authentication/GetEntityToken`, {
        Entity: {Id: pfId, Type: "master_player_account"}
    }, {
        headers: {"X-Authorization": ticket}
    }), requestOptions);
    if (r.status >= 200 && r.status < 300) return r.data.data;
    const e = new Error("GetEntityToken failed");
    e.status = r.status;
    throw e;
}

async function getEntityToken(titleId, ticket, pfId, requestOptions = {}) {
    const data = await requestEntityToken(titleId, ticket, pfId, requestOptions);
    return data.EntityToken;
}

async function getSession(titleId, os, requestOptions = {}) {
    const key = `session_${titleId}`;
    const cached = sessionCache.get(key);
    if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) return cached;
    let mutex = sessionMutexes.get(key);
    if (!mutex) {
        mutex = new Mutex();
        sessionMutexes.set(key, mutex);
    }
    return mutex.runExclusive(async () => {
        const again = sessionCache.get(key);
        if (again && (!again.expiresAt || again.expiresAt > Date.now())) return again;
        const {SessionTicket, PlayFabId} = await loginWithIOSDeviceID(titleId, os, requestOptions);
        const tokenData = await requestEntityToken(titleId, SessionTicket, PlayFabId, requestOptions);
        const expiresAt = resolveSessionExpiresAt(tokenData.TokenExpiration);
        const session = {
            SessionTicket,
            PlayFabId,
            EntityToken: tokenData.EntityToken,
            TokenExpiration: tokenData.TokenExpiration || null,
            expiresAt
        };
        sessionCache.set(key, session, {ttl: Math.max(1, expiresAt - Date.now())});
        return session;
    });
}

async function sendPlayFabRequest(titleId, endpoint, payload = {}, auth = "X-EntityToken", maxRetries = 3, os, requestOptions = {}) {
    const cacheable = UPSTREAM_CACHEABLE_ENDPOINTS.has(endpoint);
    const cacheKey = cacheable ? `pf:${titleId}:${endpoint}:${auth}:${stringify(payload || {})}` : null;
    if (cacheKey) {
        return dataCache.getOrSetAsync(cacheKey, async () => sendPlayFabRequestInternal(titleId, endpoint, payload, auth, maxRetries, os, requestOptions), UPSTREAM_RESPONSE_CACHE_TTL_MS);
    }
    return sendPlayFabRequestInternal(titleId, endpoint, payload, auth, maxRetries, os, requestOptions);
}

async function sendPlayFabRequestInternal(titleId, endpoint, payload = {}, auth = "X-EntityToken", maxRetries = 3, os, requestOptions = {}) {
    let attempt = 0;
    let lastErr;
    const budget = Number(process.env.RETRY_BUDGET || maxRetries);
    while (attempt <= budget) {
        try {
            const ses = await getSession(titleId, os, requestOptions);
            const headers = {
                [auth]: auth === "X-EntityToken" ? ses.EntityToken : ses.SessionTicket
            };
            const r = await upstreamGuard.schedule(
                titleId,
                endpoint,
                () => api.post(`https://${titleId}.playfabapi.com/${endpoint}`, payload, {headers}),
                {...requestOptions, trackFailure: attempt >= budget}
            );
            if (r.status >= 200 && r.status < 300) {
                return r.data.data ?? r.data;
            }
            const status = r.status;
            if (status === 401 && attempt < budget) {
                sessionCache.delete(`session_${titleId}`);
            }
            const shouldRetry = isRetryableUpstreamStatus(status, true);
            if (!shouldRetry || attempt >= budget) {
                const e = new Error(`Upstream error ${status}`);
                e.status = status;
                e.response = r;
                e.retryable = shouldRetry;
                const upstreamMsg = r?.data?.errorMessage || r?.data?.error?.message || r?.data?.error || null;
                if (upstreamMsg) e.publicMessage = `Upstream error ${status}: ${String(upstreamMsg)}`;
                throw e;
            }
            const waitMs = retryDelayForStatus(status, r.headers, attempt);
            await sleep(waitMs);
            attempt++;

        } catch (err) {
            lastErr = err;
            if (err?.retryable === false) throw err;
            if (attempt >= budget) throw err;
            await sleep(jitter(200, attempt, 10000));
            attempt++;
        }
    }
    throw lastErr || new Error("sendPlayFabRequest failed");
}

const ORDER_BY_ALIASES = new Map([
    ["creationdate", "CreationDate"],
    ["lastmodifieddate", "LastModifiedDate"],
    ["startdate", "StartDate"],
    ["rating/totalcount", "rating/totalcount"]
]);

function catalogItems(data) {
    return data?.Items || data?.items || [];
}

function catalogTotalCount(data) {
    const candidates = [data?.TotalCount, data?.totalCount, data?.Total, data?.total, data?.Count, data?.count];
    for (const candidate of candidates) {
        const total = Number(candidate);
        if (Number.isFinite(total) && total >= 0) return total;
    }
    return null;
}

function isValidItem(item) {
    if (!item || typeof item !== "object") return false;

    const displayProperties = item.DisplayProperties;
    if (!displayProperties || typeof displayProperties !== "object" || Array.isArray(displayProperties)) return false;

    const title = item.Title;
    if (!title || typeof title !== "object") return false;
    const neutralTitle = title.NEUTRAL ?? title.neutral;
    if (typeof neutralTitle !== "string" || neutralTitle.trim().length === 0) return false;

    const images = item.Images;
    if (!Array.isArray(images)) return false;
    for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        if (image && typeof image === "object" && typeof image.Url === "string" && image.Url.length > 0) return true;
    }
    return false;
}

function isWatchableMarketplaceItem(item) {
    if (!isValidItem(item)) return false;
    if (typeof item.Id !== "string" || item.Id.length === 0) return false;

    const displayProperties = item.DisplayProperties;
    if (typeof displayProperties.creatorName !== "string" || displayProperties.creatorName.trim().length === 0) return false;
    if (typeof displayProperties.offerId !== "string" || displayProperties.offerId.trim().length === 0) return false;
    return typeof displayProperties.purchasable === "boolean";
}

function transformCatalogItems(items) {
    const transformed = [];
    for (const item of items || []) {
        if (isValidItem(item)) transformed.push(transformItem(item));
    }
    return transformed;
}

function normalizeOrderBy(orderBy, fallback = "StartDate desc") {
    const candidate = String(orderBy || "").trim() || String(fallback || "").trim();
    if (!candidate) return "StartDate desc";

    const clauses = candidate.split(",").map(part => part.trim()).filter(Boolean);
    if (!clauses.length) return "StartDate desc";

    return clauses.map(clause => {
        const match = clause.match(/^([^,\s]+)(?:\s+(asc|desc))?$/i);
        if (!match) return clause;
        const fieldRaw = String(match[1] || "");
        const field = ORDER_BY_ALIASES.get(fieldRaw.toLowerCase()) || fieldRaw;
        const dir = String(match[2] || "desc").toLowerCase() === "asc" ? "asc" : "desc";
        return `${field} ${dir}`;
    }).join(", ");
}

function buildSearchPayload({
                                filter = "",
                                search = "",
                                top = 100,
                                skip = 0,
                                orderBy = "StartDate desc",
                                selectFields = "images,startDate",
                                expandFields = "images"
                            }) {
    const p = {
        Search: search || "",
        Top: top,
        Skip: skip,
        OrderBy: normalizeOrderBy(orderBy, "StartDate desc")
    };
    const f = (filter || "").trim();
    if (f) p.Filter = f;
    const sel = (selectFields || "").trim();
    if (sel) p.Select = sel;
    const exp = (expandFields || "").trim();
    if (exp) p.Expand = exp;
    return p;
}

function transformItem(item) {
    const safeItem = sanitizeCatalogItem(item);
    const thumbs = [];
    const shots = [];
    for (const img of (safeItem.Images || [])) {
        const tag = img.Tag || "";
        const transformed = {
            Id: img.Id,
            Tag: img.Tag,
            Type: tag === "thumbnail" || tag === "Thumbnail" ? "Thumbnail" : "Screenshot",
            Url: img.Url
        };
        if (transformed.Type === "Thumbnail") thumbs.push(transformed); else shots.push(transformed);
    }
    return {
        ...safeItem,
        StartDate: safeItem.startDate || safeItem.StartDate || safeItem.CreationDate,
        Images: [...thumbs, ...shots]
    };
}

async function fetchCatalogSearchBatch(titleId, {
    filter = "",
    search = "",
    os,
    batchSize = 300,
    skip = 0,
    orderBy = "StartDate desc"
}) {
    const payload = buildSearchPayload({filter, search, top: batchSize, skip, orderBy});
    const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, os);
    const raw = catalogItems(data);
    return {
        rawCount: raw.length,
        total: catalogTotalCount(data),
        rawItems: raw,
        items: transformCatalogItems(raw)
    };
}

function resolveCatalogBatchLimit(total, batchSize, configuredMaxBatches) {
    const totalBatches = total === null ? null : Math.max(1, Math.ceil(total / batchSize));
    const configured = Number(configuredMaxBatches);
    const hasConfiguredLimit = Number.isFinite(configured) && configured > 0;
    if (totalBatches !== null) return hasConfiguredLimit ? Math.min(totalBatches, Math.floor(configured)) : totalBatches;
    return hasConfiguredLimit ? Math.floor(configured) : CATALOG_SEARCH_UNKNOWN_TOTAL_MAX_BATCHES;
}

function andCatalogFilter(filter, clause) {
    const base = String(filter || "").trim();
    return base ? `(${base}) and (${clause})` : clause;
}

function catalogItemId(item) {
    return item?.Id || item?.id || null;
}

function uniqueCatalogItems(items) {
    const seen = new Set();
    return (items || []).filter(item => {
        const id = catalogItemId(item);
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

function catalogOrderValue(item, field) {
    const key = String(field || "").toLowerCase();
    if (key === "creationdate") return Date.parse(item?.CreationDate || item?.creationDate || "") || 0;
    if (key === "lastmodifieddate") return Date.parse(item?.LastModifiedDate || item?.lastModifiedDate || "") || 0;
    if (key === "startdate") return Date.parse(item?.StartDate || item?.startDate || "") || 0;
    if (key === "rating/totalcount") return Number(item?.Rating?.TotalCount ?? item?.rating?.totalCount ?? 0) || 0;
    return String(item?.[field] ?? item?.[key] ?? "").toLowerCase();
}

function sortCatalogItems(items, orderBy) {
    const clauses = normalizeOrderBy(orderBy).split(",").map(clause => {
        const match = clause.trim().match(/^([^\s]+)(?:\s+(asc|desc))?$/i);
        return match ? {field: match[1], direction: String(match[2] || "desc").toLowerCase() === "asc" ? 1 : -1} : null;
    }).filter(Boolean);
    return items.slice().sort((a, b) => {
        for (const clause of clauses) {
            const av = catalogOrderValue(a, clause.field);
            const bv = catalogOrderValue(b, clause.field);
            if (av < bv) return -1 * clause.direction;
            if (av > bv) return clause.direction;
        }
        return String(catalogItemId(a) || "").localeCompare(String(catalogItemId(b) || ""));
    });
}

function catalogDateMs(item, field) {
    const aliases = {
        CreationDate: ["CreationDate", "creationDate"],
        StartDate: ["StartDate", "startDate"],
        LastModifiedDate: ["LastModifiedDate", "lastModifiedDate"]
    };
    for (const key of aliases[field] || [field]) {
        const value = Date.parse(item?.[key] || "");
        if (Number.isFinite(value)) return value;
    }
    return null;
}

function catalogDateBounds(oldestItems, newestItems, field) {
    const oldestDates = (oldestItems || []).map(item => catalogDateMs(item, field)).filter(Number.isFinite);
    const newestDates = (newestItems || []).map(item => catalogDateMs(item, field)).filter(Number.isFinite);
    if (!oldestDates.length || !newestDates.length) return null;
    const oldestMs = Math.min(...oldestDates);
    const newestMs = Math.max(...newestDates);
    if (oldestMs >= newestMs || newestMs - oldestMs < 2) return null;
    return {oldestMs, newestMs};
}

async function findCatalogDateSplit(titleId, {filter, search, os}) {
    for (const field of ["CreationDate", "StartDate", "LastModifiedDate"]) {
        const [oldest, newest] = await Promise.all([
            fetchCatalogSearchBatch(titleId, {filter, search, os, batchSize: 50, skip: 0, orderBy: `${field} asc`}),
            fetchCatalogSearchBatch(titleId, {filter, search, os, batchSize: 50, skip: 0, orderBy: `${field} desc`})
        ]);
        const bounds = catalogDateBounds(oldest.rawItems, newest.rawItems, field);
        if (!bounds) continue;
        const midpointMs = bounds.oldestMs + Math.floor((bounds.newestMs - bounds.oldestMs) / 2);
        if (midpointMs <= bounds.oldestMs || midpointMs >= bounds.newestMs) continue;
        return {field, midpoint: new Date(midpointMs).toISOString()};
    }
    return null;
}

function catalogV2Expression(value) {
    return String(value || "")
        .replace(/\bCreationDate\b/g, "creationDate")
        .replace(/\bStartDate\b/g, "startDate")
        .replace(/\bLastModifiedDate\b/g, "lastModifiedDate")
        .replace(/rating\/totalcount/gi, "rating/totalCount");
}

function catalogSearchHitItem(hit) {
    return hit?.Item || hit?.item || hit;
}

function catalogSearchHitId(hit) {
    const item = catalogSearchHitItem(hit);
    return catalogItemId(hit) || catalogItemId(item) || hit?.ItemId || hit?.itemId || null;
}

async function fetchCatalogSearchItemsV2(titleId, {
    filter = "",
    search = "",
    os,
    batchSize = 300,
    concurrency = 5,
    maxBatches = 0,
    orderBy = "StartDate desc"
}) {
    const configuredLimit = Number(maxBatches);
    const safeBatchSize = Math.max(1, Number(batchSize) || 300);
    const maxItems = Number.isFinite(configuredLimit) && configuredLimit > 0
        ? Math.floor(configuredLimit) * safeBatchSize
        : CATALOG_SEARCH_UNKNOWN_TOTAL_MAX_BATCHES * safeBatchSize;
    const items = [];
    const seenTokens = new Set();
    let continuationToken = "";
    let scannedHits = 0;

    while (scannedHits < maxItems) {
        const payload = {
            Search: String(search || ""),
            Count: Math.min(GET_ITEMS_MAX_IDS, maxItems - scannedHits),
            Filter: catalogV2Expression(filter),
            OrderBy: catalogV2Expression(orderBy)
        };
        if (!payload.Filter) delete payload.Filter;
        if (!payload.OrderBy) delete payload.OrderBy;
        if (continuationToken) payload.ContinuationToken = continuationToken;

        const data = await sendPlayFabRequest(titleId, "Catalog/SearchItems", payload, "X-EntityToken", 3, os);
        const hits = data?.Items || data?.items || [];
        if (!hits.length) break;
        scannedHits += hits.length;

        const hitEntries = hits.map(hit => ({id: catalogSearchHitId(hit), item: catalogSearchHitItem(hit)})).filter(entry => entry.item);
        const ids = hitEntries.map(entry => entry.id).filter(Boolean);
        const fullItems = await getItemsByIds(titleId, ids, os, GET_ITEMS_MAX_IDS, Math.min(4, Math.max(1, concurrency)));
        const fullById = new Map(fullItems.map(item => [catalogItemId(item), item]));
        items.push(...hitEntries.map(entry => fullById.get(entry.id) || entry.item));

        const nextToken = data?.ContinuationToken || data?.continuationToken || "";
        if (!nextToken || nextToken === continuationToken || seenTokens.has(nextToken)) break;
        seenTokens.add(nextToken);
        continuationToken = nextToken;
    }

    return sortCatalogItems(uniqueCatalogItems(transformCatalogItems(items)), orderBy);
}

function isTransientCatalogSearchError(error) {
    const status = Number(error?.status || error?.response?.status) || 0;
    return error?.code === "PLAYFAB_CIRCUIT_OPEN" || [429, 500, 502, 503, 504].includes(status);
}

async function fetchCatalogSearchItems(titleId, options = {}) {
    try {
        return await fetchCatalogSearchItemsLegacy(titleId, options);
    } catch (error) {
        if (!isTransientCatalogSearchError(error)) throw error;
        logger.warn(`[PF] Catalog/Search failed with ${error.status || error.code || "a transient error"}; continuing with Catalog/SearchItems cursor pagination`);
        return fetchCatalogSearchItemsV2(titleId, options);
    }
}

async function fetchCatalogSearchItemsLegacy(titleId, {
    filter = "",
    search = "",
    os,
    batchSize = 300,
    concurrency = 5,
    maxBatches = Number(process.env.MAX_FETCH_BATCHES || 0),
    orderBy = "StartDate desc",
    splitDepth = 0
}) {
    const safeBatchSize = Math.max(1, batchSize);
    const safeConcurrency = Math.max(1, concurrency);
    const batches = new Map();

    const first = await fetchCatalogSearchBatch(titleId, {
        filter,
        search,
        os,
        batchSize: safeBatchSize,
        skip: 0,
        orderBy
    });
    batches.set(0, first.items);

    if (first.rawCount < safeBatchSize) {
        return first.items;
    }

    const configuredLimit = Number(maxBatches);
    const hasConfiguredLimit = Number.isFinite(configuredLimit) && configuredLimit > 0;
    const maxOffsetBatches = Math.floor(CATALOG_SEARCH_MAX_SKIP / safeBatchSize) + 1;

    if (!hasConfiguredLimit && first.total !== null && first.total > maxOffsetBatches * safeBatchSize) {
        const split = splitDepth < 32
            ? await findCatalogDateSplit(titleId, {filter, search, os})
            : null;
        if (!split) {
            logger.warn("[PF] Catalog/Search offset limit reached; continuing with Catalog/SearchItems cursor pagination");
            return fetchCatalogSearchItemsV2(titleId, {
                filter, search, os, batchSize: safeBatchSize, concurrency: safeConcurrency, maxBatches, orderBy
            });
        }

        const [olderItems, newerItems] = await Promise.all([
            fetchCatalogSearchItems(titleId, {
                filter: andCatalogFilter(filter, `${split.field} lt ${split.midpoint}`), search, os,
                batchSize: safeBatchSize, concurrency: safeConcurrency, maxBatches: 0, orderBy,
                splitDepth: splitDepth + 1
            }),
            fetchCatalogSearchItems(titleId, {
                filter: andCatalogFilter(filter, `${split.field} ge ${split.midpoint}`), search, os,
                batchSize: safeBatchSize, concurrency: safeConcurrency, maxBatches: 0, orderBy,
                splitDepth: splitDepth + 1
            })
        ]);
        return sortCatalogItems(uniqueCatalogItems([...olderItems, ...newerItems]), orderBy);
    }

    const totalBatches = Math.min(
        resolveCatalogBatchLimit(first.total, safeBatchSize, maxBatches),
        maxOffsetBatches
    );

    if (totalBatches <= 1) {
        return first.items;
    }

    let nextBatchIndex = 0;
    let stopAtBatch = totalBatches;

    async function worker() {
        while (true) {
            const batchIndex = nextBatchIndex + 1;
            nextBatchIndex += 1;
            if (batchIndex >= stopAtBatch || batchIndex >= totalBatches) break;

            const result = await fetchCatalogSearchBatch(titleId, {
                filter,
                search,
                os,
                batchSize: safeBatchSize,
                skip: batchIndex * safeBatchSize,
                orderBy
            });

            if (first.total === null && result.rawCount < safeBatchSize) {
                const discoveredStop = batchIndex + 1;
                if (discoveredStop < stopAtBatch) stopAtBatch = discoveredStop;
            }

            batches.set(batchIndex, result.items);
        }
    }

    await Promise.all(Array.from({length: safeConcurrency}, () => worker()));

    const all = [];
    const orderedIndexes = Array.from(batches.keys()).sort((a, b) => a - b);
    for (const idx of orderedIndexes) {
        const chunk = batches.get(idx);
        if (Array.isArray(chunk) && chunk.length) all.push(...chunk);
    }
    return all;
}

async function fetchAllMarketplaceItemsEfficiently(titleId, filter, os, batchSize = 300, concurrency = 5, maxBatches = Number(process.env.MAX_FETCH_BATCHES || 0), orderBy = "StartDate desc") {
    return fetchCatalogSearchItems(titleId, {
        filter,
        search: "",
        os,
        batchSize,
        concurrency,
        maxBatches,
        orderBy
    });
}

async function getItemsByIds(titleId, ids, os, batchSize = 100, concurrency = 5) {
    const list = Array.from(new Set((ids || []).filter(Boolean)));
    if (!list.length) return [];
    const safeBatchSize = Math.min(GET_ITEMS_MAX_IDS, Math.max(1, parseInt(batchSize, 10) || GET_ITEMS_MAX_IDS));
    const safeConcurrency = Math.max(1, parseInt(concurrency, 10) || 1);

    const byId = new Map();
    const missing = [];
    for (const id of list) {
        const cacheKey = `pf:item:${titleId}:${os || "default"}:${id}`;
        const cached = dataCache.get(cacheKey);
        if (cached) {
            byId.set(id, cached);
        } else {
            missing.push(id);
        }
    }

    if (!missing.length) {
        return list.map(id => byId.get(id)).filter(Boolean);
    }

    for (let i = 0; i < missing.length; i += safeBatchSize * safeConcurrency) {
        const window = missing.slice(i, i + safeBatchSize * safeConcurrency);
        const groups = [];
        for (let j = 0; j < window.length; j += safeBatchSize) {
            groups.push(window.slice(j, j + safeBatchSize));
        }
        const res = await Promise.all(groups.map(async g => {
            const r = await sendPlayFabRequest(titleId, "Catalog/GetItems", {
                Ids: g,
                Expand: "Images"
            }, "X-EntityToken", 3, os);
            return r.Items || r.items || [];
        }));
        for (const arr of res) {
            for (const item of arr) {
                const id = item?.Id || item?.id;
                if (!id) continue;
                byId.set(id, item);
                dataCache.set(`pf:item:${titleId}:${os || "default"}:${id}`, item, {ttl: ITEM_BY_ID_CACHE_TTL_MS});
            }
        }
    }

    return list.map(id => byId.get(id)).filter(Boolean);
}

async function getItemById(titleId, id, os, requestOptions = {}) {
    const itemId = String(id || "").trim();
    if (!itemId) return null;
    const data = await sendPlayFabRequest(titleId, "Catalog/GetItem", {Id: itemId}, "X-EntityToken", 3, os, requestOptions);
    return data?.Item || data?.item || null;
}

async function getStoreItems(titleId, storeId, os, requestOptions = {}) {
    logger.debug(`[PF] GetStoreItems titleId=${titleId} storeId=${storeId}`);
    try {
        const r = await sendPlayFabRequest(titleId, "Catalog/GetStoreItems", {StoreId: storeId}, "X-EntityToken", 3, os, requestOptions);
        const items = r?.Items || r?.items || [];
        logger.debug(`[PF] GetStoreItems result storeId=${storeId} items=${items.length}`);
        return r;
    } catch (err) {
        const status = err?.status || err?.response?.status || 0;
        const msg = err?.response?.data?.error?.message || err?.message || "unknown";
        const isTransient = [429, 500, 502, 503, 504].includes(status);
        const level = isTransient ? "warn" : "debug";
        logger[level](`[PF] GetStoreItems error storeId=${storeId} status=${status || "ERR"} msg=${msg}`);
        return {Items: []};
    }
}

async function getItemReviewSummary(titleId, itemId, os) {
    const r = await sendPlayFabRequest(titleId, "Catalog/GetItemReviewSummary", {Id: itemId}, "X-EntityToken", 3, os);
    return r;
}

async function getItemReviews(titleId, itemId, count = 10, skip = 0, os) {
    const r = await sendPlayFabRequest(titleId, "Catalog/GetItemReviews", {
        Id: itemId,
        Count: count,
        Skip: skip
    }, "X-EntityToken", 3, os);
    return r;
}

module.exports = {
    loginWithIOSDeviceID,
    getEntityToken,
    getSession,
    sendPlayFabRequest,
    fetchCatalogSearchItems,
    fetchCatalogSearchItemsV2,
    isTransientCatalogSearchError,
    resolveCatalogBatchLimit,
    fetchAllMarketplaceItemsEfficiently,
    isValidItem,
    isWatchableMarketplaceItem,
    transformItem,
    buildSearchPayload,
    getItemById,
    getItemsByIds,
    getStoreItems,
    getItemReviewSummary,
    getItemReviews,
    _internals: {
        isRetryableUpstreamStatus,
        retryDelayForStatus,
        catalogDateBounds,
        catalogV2Expression,
        isTransientCatalogSearchError,
        readPersistentPlayFabDeviceId,
        resolvePersistentPlayFabDeviceId,
        resolvePlayFabDeviceId,
        resolveSessionExpiresAt
    }
};
