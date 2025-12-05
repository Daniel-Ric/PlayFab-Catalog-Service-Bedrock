const axios = require("axios");
const http = require("http");
const https = require("https");
const {Mutex} = require("async-mutex");
const {sessionCache} = require("../config/cache");
const logger = require("../config/logger");

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

const mutex = new Mutex();
const SESSION_SOFT_TTL_MS = 25 * 60 * 1000;

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

async function loginWithIOSDeviceID(titleId, os) {
    const deviceId = `ios-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const r = await api.post(`https://${titleId}.playfabapi.com/Client/LoginWithIOSDeviceID`, {
        CreateAccount: true, TitleId: titleId, DeviceId: deviceId, OS: os
    });
    if (r.status >= 200 && r.status < 300) return r.data.data;
    const e = new Error("Login failed");
    e.status = r.status;
    throw e;
}

async function getEntityToken(titleId, ticket, pfId) {
    const r = await api.post(`https://${titleId}.playfabapi.com/Authentication/GetEntityToken`, {
        Entity: {Id: pfId, Type: "master_player_account"}
    }, {
        headers: {"X-Authorization": ticket}
    });
    if (r.status >= 200 && r.status < 300) return r.data.data.EntityToken;
    const e = new Error("GetEntityToken failed");
    e.status = r.status;
    throw e;
}

async function getSession(titleId, os) {
    const key = `session_${titleId}`;
    const cached = sessionCache.get(key);
    if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) return cached;
    return mutex.runExclusive(async () => {
        const again = sessionCache.get(key);
        if (again && (!again.expiresAt || again.expiresAt > Date.now())) return again;
        const {SessionTicket, PlayFabId} = await loginWithIOSDeviceID(titleId, os);
        const EntityToken = await getEntityToken(titleId, SessionTicket, PlayFabId);
        const session = {
            SessionTicket, PlayFabId, EntityToken, expiresAt: Date.now() + SESSION_SOFT_TTL_MS
        };
        sessionCache.set(key, session);
        return session;
    });
}

async function sendPlayFabRequest(titleId, endpoint, payload = {}, auth = "X-EntityToken", maxRetries = 3, os) {
    let attempt = 0;
    let lastErr;
    const budget = Number(process.env.RETRY_BUDGET || maxRetries);
    while (attempt <= budget) {
        try {
            const ses = await getSession(titleId, os);
            const headers = {
                [auth]: auth === "X-EntityToken" ? ses.EntityToken : ses.SessionTicket
            };
            const r = await api.post(`https://${titleId}.playfabapi.com/${endpoint}`, payload, {headers});
            if (r.status >= 200 && r.status < 300) {
                return r.data.data ?? r.data;
            }
            const status = r.status;
            if (status === 401 && attempt < budget) {
                sessionCache.delete(`session_${titleId}`);
            }
            const shouldRetry = [401, 408, 409, 425, 429, 500, 502, 503, 504].includes(status);
            if (!shouldRetry || attempt >= budget) {
                const e = new Error(`Upstream error ${status}`);
                e.status = status;
                e.response = r;
                throw e;
            }
            let waitMs;
            if (status === 429) {
                waitMs = parseRetryAfter(r.headers["retry-after"]) ?? jitter(200, attempt, 10000);
            } else {
                waitMs = jitter(200, attempt, 10000);
            }
            await sleep(waitMs);
            attempt++;

        } catch (err) {
            lastErr = err;
            if (attempt >= budget) throw err;
            await sleep(jitter(200, attempt, 10000));
            attempt++;
        }
    }
    throw lastErr || new Error("sendPlayFabRequest failed");
}

function buildSearchPayload({
                                filter = "",
                                search = "",
                                top = 100,
                                skip = 0,
                                orderBy = "startDate desc",
                                selectFields = "images,startDate",
                                expandFields = "images"
                            }) {
    const p = {
        Search: search || "", Top: top, Skip: skip, OrderBy: orderBy || "startDate desc"
    };
    const f = (filter || "").trim();
    if (f) p.Filter = f;
    const sel = (selectFields || "").trim();
    if (sel) p.Select = sel;
    const exp = (expandFields || "").trim();
    if (exp) p.Expand = exp;
    return p;
}

function isValidItem(item) {
    return (item.DisplayProperties && (item.Title?.NEUTRAL || item.Title?.neutral) && Array.isArray(item.Images) && item.Images.length > 0);
}

function transformItem(item) {
    const images = (item.Images || []).map(img => {
        const tag = (img.Tag || "").toLowerCase();
        return {
            Id: img.Id, Tag: img.Tag, Type: tag === "thumbnail" ? "thumbnail" : "screenshot", Url: img.Url
        };
    });
    const thumbs = images.filter(i => i.Type === "thumbnail");
    const shots = images.filter(i => i.Type !== "thumbnail");
    return {
        ...item, StartDate: item.startDate || item.StartDate || item.CreationDate, Images: [...thumbs, ...shots]
    };
}

async function fetchAllMarketplaceItemsEfficiently(titleId, filter, os, batchSize = 300, concurrency = 5, maxBatches = Number(process.env.MAX_FETCH_BATCHES || 20)) {
    const all = [];
    const skips = [];
    for (let s = 0; s < maxBatches * batchSize; s += batchSize) skips.push(s);
    for (let i = 0; i < skips.length; i += concurrency) {
        const chunk = skips.slice(i, i + concurrency);
        const res = await Promise.all(chunk.map(async skip => {
            const payload = buildSearchPayload({
                filter, search: "", top: batchSize, skip, orderBy: "startDate desc"
            });
            const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, os);
            return data.Items || [];
        }));
        let stop = false;
        for (const arr of res) {
            if (!arr.length) {
                stop = true;
                break;
            }
            all.push(...arr.filter(isValidItem).map(transformItem));
        }
        if (stop || res[res.length - 1].length < batchSize) break;
    }
    return all;
}

async function getItemsByIds(titleId, ids, os, batchSize = 100, concurrency = 5) {
    const list = Array.from(new Set((ids || []).filter(Boolean)));
    if (!list.length) return [];
    const out = [];
    for (let i = 0; i < list.length; i += batchSize * concurrency) {
        const window = list.slice(i, i + batchSize * concurrency);
        const groups = [];
        for (let j = 0; j < window.length; j += batchSize) {
            groups.push(window.slice(j, j + batchSize));
        }
        const res = await Promise.all(groups.map(async g => {
            const r = await sendPlayFabRequest(titleId, "Catalog/GetItems", {
                Ids: g,
                Expand: "Images"
            }, "X-EntityToken", 3, os);
            return r.Items || r.items || [];
        }));
        for (const arr of res) out.push(...arr);
    }
    return out;
}

async function getStoreItems(titleId, storeId, os) {
    logger.debug(`[PF] GetStoreItems titleId=${titleId} storeId=${storeId}`);
    try {
        const r = await sendPlayFabRequest(titleId, "Catalog/GetStoreItems", {StoreId: storeId}, "X-EntityToken", 3, os);
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
    fetchAllMarketplaceItemsEfficiently,
    isValidItem,
    transformItem,
    buildSearchPayload,
    getItemsByIds,
    getStoreItems,
    getItemReviewSummary,
    getItemReviews
};
