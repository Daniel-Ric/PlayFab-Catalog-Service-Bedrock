// src/utils/playfab.js

const axios = require("axios");
const { Mutex } = require("async-mutex");
const { sessionCache } = require("../config/cache");
const logger = require("../config/logger");

const mutex = new Mutex();

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
        Search:  search,
        Top:     top,
        Skip:    skip,
        OrderBy: orderBy,
        Select:  selectFields,
        Expand:  expandFields
    };
    if (filter) p.Filter = filter;
    return p;
}

/**
 * Loggt in mit einer iOS-Geräte-ID und gibt SessionTicket und PlayFabId zurück.
 */
async function loginWithIOSDeviceID(titleId, os) {
    const deviceId = `ios-${Date.now()}-${Math.random().toString(36).substr(2, 10)}`;
    logger.info(`→ LOGIN    Title=${titleId}  DeviceID=${deviceId}`);
    const r = await axios.post(
        `https://${titleId}.playfabapi.com/Client/LoginWithIOSDeviceID`,
        { CreateAccount: true, TitleId: titleId, DeviceId: deviceId, OS: os },
        { headers: { "Content-Type": "application/json" } }
    );
    return r.data.data;
}

/**
 * Holt das EntityToken, benötigt die PlayFabId aus dem Login.
 */
async function getEntityToken(titleId, ticket, pfId) {
    logger.info(`→ TOKEN    Title=${titleId}`);
    const r = await axios.post(
        `https://${titleId}.playfabapi.com/Authentication/GetEntityToken`,
        { Entity: { Id: pfId, Type: "master_player_account" } },
        { headers: { "Content-Type": "application/json", "X-Authorization": ticket } }
    );
    return r.data.data.EntityToken;
}

/**
 * Gibt ein Objekt { SessionTicket, PlayFabId, EntityToken } zurück,
 * cached es und stellt sicher, dass nur eine parallele Initialisierung läuft.
 */
async function getSession(titleId, os) {
    const key = `session_${titleId}`;
    if (sessionCache.has(key)) {
        return sessionCache.get(key);
    }
    return mutex.runExclusive(async () => {
        if (sessionCache.has(key)) return sessionCache.get(key);
        const { SessionTicket, PlayFabId } = await loginWithIOSDeviceID(titleId, os);
        const EntityToken = await getEntityToken(titleId, SessionTicket, PlayFabId);
        const session = { SessionTicket, PlayFabId, EntityToken };
        sessionCache.set(key, session);
        return session;
    });
}

/**
 * Send a PlayFab request with retry/backoff logic.
 */
async function sendPlayFabRequest(titleId, endpoint, payload = {}, auth = "X-EntityToken", max = 3, os) {
    let attempt = 0;
    while (attempt <= max) {
        try {
            const ses = await getSession(titleId, os);
            logger.info(`→ PLAYFAB  ${endpoint}  (Try ${attempt + 1})`);
            const headers = {
                "Content-Type": "application/json",
                [auth]:         auth === "X-EntityToken" ? ses.EntityToken : ses.SessionTicket
            };
            const start = Date.now();
            const r = await axios.post(`https://${titleId}.playfabapi.com/${endpoint}`, payload, { headers });
            logger.info(`← PLAYFAB  ✅ ${endpoint} in ${Date.now() - start}ms`);
            return r.data.data;
        } catch (err) {
            const status = err.response?.status;
            logger.warn(`← PLAYFAB  ⚠️  ${endpoint} failed (${status}), try ${attempt + 1}`);
            if (status === 401 && attempt < max) {
                sessionCache.del(`session_${titleId}`);
            }
            if ([401, 429, 500].includes(status) && attempt < max) {
                await new Promise(res => setTimeout(res, status === 429 ? 3000 : 1000 * (attempt + 1)));
                attempt++;
                continue;
            }
            throw err;
        }
    }
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
    const MAX = 10000;
    const all = [];
    const skips = [];
    for (let s = 0; s <= MAX; s += size) skips.push(s);

    for (let i = 0; i < skips.length; i += conc) {
        const chunk = skips.slice(i, i + conc);
        const batches = await Promise.all(chunk.map(skip => {
            const payload = buildSearchPayload({
                filter,
                search: "",
                top:    size,
                skip,
                orderBy: "creationDate desc"
            });
            return sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, os)
                .then(data => data.Items || []);
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
