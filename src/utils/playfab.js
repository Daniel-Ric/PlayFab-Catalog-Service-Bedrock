const axios = require("axios");
const http = require("http");
const https = require("https");
const { Mutex } = require("async-mutex");
const { sessionCache } = require("../config/cache");
const logger = require("../config/logger");

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 128, keepAliveMsecs: 60000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 128, keepAliveMsecs: 60000 });

const api = axios.create({
    timeout: 20000,
    httpAgent,
    httpsAgent,
    headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Language": "en-GB",
        "User-Agent": "ViewMarketplace/legacy-fast"
    },
    validateStatus: () => true
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

async function loginWithIOSDeviceID(titleId, os) {
    const deviceId = `ios-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const r = await api.post(`https://${titleId}.playfabapi.com/Client/LoginWithIOSDeviceID`, {
        CreateAccount: true,
        TitleId: titleId,
        DeviceId: deviceId,
        OS: os
    });
    if (r.status >= 200 && r.status < 300) return r.data.data;
    const e = new Error("Login failed");
    e.status = r.status;
    throw e;
}

async function getEntityToken(titleId, ticket, pfId) {
    const r = await api.post(`https://${titleId}.playfabapi.com/Authentication/GetEntityToken`, {
        Entity: { Id: pfId, Type: "master_player_account" }
    }, {
        headers: { "X-Authorization": ticket }
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

        const { SessionTicket, PlayFabId } = await loginWithIOSDeviceID(titleId, os);
        const EntityToken = await getEntityToken(titleId, SessionTicket, PlayFabId);
        const session = { SessionTicket, PlayFabId, EntityToken, expiresAt: Date.now() + SESSION_SOFT_TTL_MS };
        sessionCache.set(key, session);
        return session;
    });
}

async function sendPlayFabRequest(titleId, endpoint, payload = {}, auth = "X-EntityToken", maxRetries = 3, os) {
    let attempt = 0;
    let lastErr;
    while (attempt <= maxRetries) {
        try {
            const ses = await getSession(titleId, os);
            const headers = {
                [auth]: auth === "X-EntityToken" ? ses.EntityToken : ses.SessionTicket
            };
            const r = await api.post(`https://${titleId}.playfabapi.com/${endpoint}`, payload, { headers });
            if (r.status >= 200 && r.status < 300) {
                return r.data.data ?? r.data;
            }
            const status = r.status;
            if (status === 401 && attempt < maxRetries) {
                sessionCache.del(`session_${titleId}`);
            }
            const shouldRetry = [401, 408, 409, 425, 429, 500, 502, 503, 504].includes(status);
            if (!shouldRetry || attempt >= maxRetries) {
                const e = new Error(`Upstream error ${status}`);
                e.status = status;
                e.response = r;
                throw e;
            }
            let waitMs;
            if (status === 429) waitMs = parseRetryAfter(r.headers["retry-after"]) ?? 3000;
            else waitMs = Math.min(10000, 400 * Math.pow(2, attempt));
            await sleep(waitMs);
            attempt++;
            continue;
        } catch (err) {
            lastErr = err;
            if (attempt >= maxRetries) throw err;
            await sleep(Math.min(10000, 400 * Math.pow(2, attempt)));
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
                                orderBy = "creationDate desc",
                                selectFields = "images,startDate",
                                expandFields = "images"
                            }) {
    const p = {
        Search: search || "",
        Top: top,
        Skip: skip,
        OrderBy: orderBy || "creationDate desc"
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
    return item.DisplayProperties &&
        (item.Title?.NEUTRAL || item.Title?.neutral) &&
        Array.isArray(item.Images) &&
        item.Images.length > 0;
}

function transformItem(item) {
    const images = (item.Images || []).map(img => {
        const tag = (img.Tag || "").toLowerCase();
        return {
            Id: img.Id,
            Tag: img.Tag,
            Type: tag === "thumbnail" ? "thumbnail" : "screenshot",
            Url: img.Url
        };
    });
    const thumbs = images.filter(i => i.Type === "thumbnail");
    const shots = images.filter(i => i.Type !== "thumbnail");
    return {
        ...item,
        StartDate: item.startDate || item.StartDate || item.CreationDate,
        Images: [...thumbs, ...shots]
    };
}

async function fetchAllMarketplaceItemsEfficiently(titleId, filter, os, batchSize = 300, concurrency = 5) {
    const all = [];
    const skips = [];
    for (let s = 0; s <= 10000; s += batchSize) skips.push(s);
    for (let i = 0; i < skips.length; i += concurrency) {
        const chunk = skips.slice(i, i + concurrency);
        const res = await Promise.all(chunk.map(async skip => {
            const payload = buildSearchPayload({
                filter,
                search: "",
                top: batchSize,
                skip,
                orderBy: "creationDate desc"
            });
            const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, os);
            return data.Items || [];
        }));
        let stop = false;
        for (const arr of res) {
            if (!arr.length) { stop = true; break; }
            all.push(...arr.filter(isValidItem).map(transformItem));
        }
        if (stop || res[res.length - 1].length < batchSize) break;
    }
    return all;
}

module.exports = {
    loginWithIOSDeviceID,
    getEntityToken,
    getSession,
    sendPlayFabRequest,
    fetchAllMarketplaceItemsEfficiently,
    isValidItem,
    transformItem,
    buildSearchPayload
};
