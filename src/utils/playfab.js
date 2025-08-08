// src/utils/playfab.js

const { fetch, Agent, setGlobalDispatcher } = require("undici");
const Bottleneck = require("bottleneck");
const { Mutex } = require("async-mutex");
const { sessionCache } = require("../config/cache");
const logger = require("../config/logger");

const mutex = new Mutex();

const dispatcher = new Agent({
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 60_000,
    connections: 128,
    pipelining: 1
});
setGlobalDispatcher(dispatcher);

const limiter = new Bottleneck({
    maxConcurrent: 24,
    minTime: 0,
    reservoir: 120,
    reservoirRefreshInterval: 1_000,
    reservoirRefreshAmount: 120,
    highWater: 2000,
    strategy: Bottleneck.strategy.BLOCK,
    trackDoneStatus: true
});

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

function jitter(baseMs) {
    return Math.floor(Math.random() * baseMs);
}

function parseRetryAfter(h) {
    if (!h) return null;
    const v = Array.isArray(h) ? h[0] : h;
    const asNum = Number(v);
    if (!Number.isNaN(asNum)) return Math.max(0, Math.floor(asNum * 1000));
    return 3000;
}

function newRequestId() {
    return Math.random().toString(36).slice(2, 10);
}

/**
 * Baut das Standard-Payload für Catalog/Search
 * mit Select/Expand für images und startDate.
 */
function buildSearchPayload({
                                filter       = "",
                                search       = "",
                                top          = 100,
                                skip         = 0,
                                orderBy      = "creationDate desc",
                                selectFields = "images,startDate",
                                expandFields = "images"
                            }) {
    const p = {
        Search:  search || "",
        Top:     top,
        Skip:    skip,
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

async function postJson(baseURL, path, body, headers, timeoutMs = 20_000) {
    const url = `${baseURL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(new Error("request-timeout")), timeoutMs);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate, br",
                "Content-Type": "application/json",
                "User-Agent": "ViewMarketplace/1.0 (+playfab-service)",
                ...headers
            },
            body: JSON.stringify(body),
            signal: ac.signal
        });

        const hdr = Object.fromEntries(res.headers);

        let parsed;
        const text = await res.text();
        if (text && text.trim().length > 0) {
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                const err = new Error(`Upstream returned non-JSON response (status ${res.status})`);
                err.status = res.status;
                err.headers = hdr;
                err.body = text.slice(0, 500);
                throw err;
            }
        } else {
            parsed = {};
        }

        return { status: res.status, headers: hdr, data: parsed };
    } catch (e) {
        if (e.name === "AbortError" || e.message === "request-timeout") {
            const err = new Error("Request timed out");
            err.status = 408;
            throw err;
        }
        throw e;
    } finally {
        clearTimeout(to);
    }
}

/**
 * Loggt in mit einer iOS-Geräte-ID und gibt SessionTicket und PlayFabId zurück.
 */
async function loginWithIOSDeviceID(titleId, os) {
    const deviceId = `ios-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const requestId = newRequestId();
    const baseURL = `https://${titleId}.playfabapi.com`;
    logger.info(`→ LOGIN    Title=${titleId}  DeviceID=${deviceId}  req=${requestId}`);
    const r = await limiter.schedule(() =>
        postJson(
            baseURL,
            "Client/LoginWithIOSDeviceID",
            { CreateAccount: true, TitleId: titleId, DeviceId: deviceId, OS: os },
            { "X-Request-Id": requestId }
        )
    );
    return r.data.data;
}

/**
 * Holt das EntityToken, benötigt die PlayFabId aus dem Login.
 */
async function getEntityToken(titleId, ticket, pfId) {
    const requestId = newRequestId();
    const baseURL = `https://${titleId}.playfabapi.com`;
    logger.info(`→ TOKEN    Title=${titleId}  req=${requestId}`);
    const r = await limiter.schedule(() =>
        postJson(
            baseURL,
            "Authentication/GetEntityToken",
            { Entity: { Id: pfId, Type: "master_player_account" } },
            { "X-Authorization": ticket, "X-Request-Id": requestId }
        )
    );
    return r.data.data.EntityToken;
}

/**
 * Gibt ein Objekt { SessionTicket, PlayFabId, EntityToken } zurück,
 * cached es und stellt sicher, dass nur eine parallele Initialisierung läuft.
 */
const SESSION_SOFT_TTL_MS = 25 * 60 * 1000;

async function getSession(titleId, os) {
    const key = `session_${titleId}`;
    const cached = sessionCache.get(key);
    if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) {
        return cached;
    }
    return mutex.runExclusive(async () => {
        const again = sessionCache.get(key);
        if (again && (!again.expiresAt || again.expiresAt > Date.now())) return again;

        const { SessionTicket, PlayFabId } = await loginWithIOSDeviceID(titleId, os);
        const EntityToken = await getEntityToken(titleId, SessionTicket, PlayFabId);
        const session = {
            SessionTicket,
            PlayFabId,
            EntityToken,
            expiresAt: Date.now() + SESSION_SOFT_TTL_MS
        };
        sessionCache.set(key, session);
        return session;
    });
}

/**
 * Send a PlayFab request with smart retry/backoff.
 */
async function sendPlayFabRequest(titleId, endpoint, payload = {}, auth = "X-EntityToken", max = 3, os) {
    const baseURL = `https://${titleId}.playfabapi.com`;
    const requestId = newRequestId();

    let attempt = 0;
    let lastErr;

    while (attempt <= max) {
        try {
            const ses = await getSession(titleId, os);
            const headers = {
                "X-Request-Id": requestId,
                [auth]: auth === "X-EntityToken" ? ses.EntityToken : ses.SessionTicket
            };

            logger.info(`→ PLAYFAB  ${endpoint}  (Try ${attempt + 1}) req=${requestId}`);
            const start = Date.now();

            const r = await limiter.schedule(() => postJson(baseURL, endpoint, payload, headers));
            logger.info(`← PLAYFAB  ✅ ${endpoint} in ${Date.now() - start}ms req=${requestId}`);

            if (r && r.data) {
                if (typeof r.data.data !== "undefined") {
                    return r.data.data;
                }
                return r.data;
            }
            return {};

        } catch (err) {
            lastErr = err;
            const status = err.response?.status ?? err.status;
            const code = err.code;
            const headers = err.response?.headers || err.headers || {};
            const isNetwork =
                code === "ECONNRESET" ||
                code === "ETIMEDOUT" ||
                code === "EAI_AGAIN" ||
                code === "ENOTFOUND" ||
                code === "ESOCKETTIMEDOUT";

            logger.warn(`← PLAYFAB  ⚠️  ${endpoint} failed (status=${status || code || "unknown"}) try=${attempt + 1}`);

            if (status === 401 && attempt < max) {
                sessionCache.del(`session_${titleId}`);
            }

            const shouldRetry =
                (status && [401, 408, 409, 425, 429, 500, 502, 503, 504].includes(status)) ||
                isNetwork;

            if (!shouldRetry || attempt >= max) {
                throw err;
            }

            let waitMs;
            if (status === 429) {
                waitMs = parseRetryAfter(headers["retry-after"]) ?? 3000;
            } else {
                const base = 400 * Math.pow(2, attempt);
                waitMs = Math.min(10_000, base + jitter(base));
            }

            await sleep(waitMs);
            attempt++;
            continue;
        }
    }

    throw lastErr || new Error("Unbekannter Fehler in sendPlayFabRequest");
}

function isValidItem(item) {
    return item.DisplayProperties &&
        (item.Title?.NEUTRAL || item.Title?.neutral) &&
        Array.isArray(item.Images) &&
        item.Images.length > 0;
}

/**
 * Transformiert das Item: nutzt echtes startDate und mapped img.Tag → Type,
 * mit Safe-Check, falls img.Tag fehlt.
 */
function transformItem(item) {
    const imagesMapped = (item.Images || []).map(img => {
        const tag = (img.Tag || "").toLowerCase();
        return {
            Id:  img.Id,
            Tag: img.Tag,
            Type: tag === "thumbnail" ? "thumbnail" : "screenshot",
            Url: img.Url
        };
    });

    const thumbnails  = imagesMapped.filter(img => img.Type === "thumbnail");
    const screenshots = imagesMapped.filter(img => img.Type !== "thumbnail");

    return {
        ...item,
        StartDate: item.startDate || item.StartDate || item.CreationDate,
        Images: [...thumbnails, ...screenshots]
    };
}

/**
 * Fetch ALL items in batches, nutzt buildSearchPayload.
 */
async function fetchAllMarketplaceItemsEfficiently(titleId, filter, os, size = 300, conc = 5) {
    const MAX = 10_000;
    const all = [];
    const skips = [];
    for (let s = 0; s <= MAX; s += size) skips.push(s);

    for (let i = 0; i < skips.length; i += conc) {
        const chunk = skips.slice(i, i + conc);
        const batches = await Promise.all(chunk.map(async skip => {
            const payload = buildSearchPayload({
                filter,
                search: "",
                top: size,
                skip,
                orderBy: "creationDate desc"
            });
            const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, os);
            return data.Items || [];
        }));

        let done = false;
        for (const arr of batches) {
            if (!arr.length) { done = true; break; }
            all.push(...arr.filter(isValidItem).map(transformItem));
        }
        if (done) break;
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
