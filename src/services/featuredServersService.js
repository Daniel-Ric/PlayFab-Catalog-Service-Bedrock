// -----------------------------------------------------------------------------
//
// File: src/services/featuredServersService.js
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
const http = require("http");
const https = require("https");
const {randomUUID} = require("crypto");
const {dataCache} = require("../config/cache");
const logger = require("../config/logger");
const {getSession} = require("../utils/playfab");

const httpAgent = new http.Agent({
    keepAlive: true, maxSockets: Number(process.env.HTTP_MAX_SOCKETS || 512), keepAliveMsecs: 60000, scheduling: "lifo"
});

const httpsAgent = new https.Agent({
    keepAlive: true, maxSockets: Number(process.env.HTTPS_MAX_SOCKETS || 512), keepAliveMsecs: 60000, scheduling: "lifo"
});

const api = axios.create({
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 20000), httpAgent, httpsAgent, headers: {
        "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "libhttpclient/1.0.0.0"
    }, validateStatus: () => true
});

const AUTH_BASE = process.env.MC_AUTH_BASE || "https://authorization.franchise.minecraft-services.net";
const DISCOVERY_BASE = process.env.MC_DISCOVERY_BASE || "https://gatherings-secondary.franchise.minecraft-services.net";
const CLIENT_VERSION_URL = process.env.MC_CLIENT_VERSION_URL || "https://displaycatalog.mp.microsoft.com/v7.0/products/9NBLGGH2JHXJ/?market=CA&languages=en-CA,en,neutral";
const CLIENT_VERSION_OVERRIDE = (process.env.MC_CLIENT_VERSION || "").trim();

const CLIENT_VERSION_TTL_MS = Number(process.env.MC_CLIENT_VERSION_TTL_MS || 12 * 60 * 60 * 1000);
const TOKEN_TTL_MS = Number(process.env.MC_TOKEN_TTL_MS || 15 * 60 * 1000);

const MC_LANGUAGE = process.env.MC_LANGUAGE || "en";
const MC_LANGUAGE_CODE = process.env.MC_LANGUAGE_CODE || "en-US";
const MC_REGION_CODE = process.env.MC_REGION_CODE || "US";
const MC_TOKEN_TYPE = process.env.MC_TOKEN_TYPE || "playfab";
const MC_APPLICATION_TYPE = process.env.MC_APPLICATION_TYPE || "MinecraftPE";
const MC_PLATFORM = process.env.MC_PLATFORM || "Windows10";
const MC_STORE_PLATFORM = process.env.MC_STORE_PLATFORM || "uwp.store";

const DISCOVERY_FILTER = process.env.MC_FEATURED_FILTER || "(contentType eq '3PP_V2.0') and platforms/any(tp: tp eq 'android.googleplay' and tp eq 'title.bedrockvanilla')";
const DISCOVERY_SCID = process.env.MC_FEATURED_SCID || "4fc10100-5f7a-4470-899b-280835760c07";
const DISCOVERY_ORDER = process.env.MC_FEATURED_ORDER || "startDate desc";
const DISCOVERY_SELECT = process.env.MC_FEATURED_SELECT || "images";
const DISCOVERY_TOP = Math.max(1, parseInt(process.env.MC_FEATURED_TOP || "75", 10));

function extractClientVersion(data) {
    const full = data?.Product?.DisplaySkuAvailabilities?.[0]?.Sku?.Properties?.Packages?.[0]?.PackageFullName;
    const match = String(full || "").match(/(\d+\.\d+\.\d+)\.\d+/);
    if (match) return match[1];
    return findVersionInObject(data);
}

function findVersionInObject(data) {
    const seen = new Set();
    const stack = [data];
    while (stack.length) {
        const current = stack.pop();
        if (!current) continue;
        if (typeof current === "string") {
            const match = current.match(/(\d+\.\d+\.\d+)\.\d+/);
            if (match) return match[1];
            continue;
        }
        if (typeof current !== "object") continue;
        if (seen.has(current)) continue;
        seen.add(current);
        if (Array.isArray(current)) {
            for (let i = 0; i < current.length; i += 1) stack.push(current[i]);
        } else {
            for (const key of Object.keys(current)) stack.push(current[key]);
        }
    }
    return null;
}

async function fetchClientVersion() {
    if (CLIENT_VERSION_OVERRIDE) return CLIENT_VERSION_OVERRIDE;
    const lastKnown = dataCache.get("mc-client-version:last");
    try {
        const version = await dataCache.getOrSetAsync("mc-client-version", async () => {
            const r = await api.get(CLIENT_VERSION_URL);
            if (r.status < 200 || r.status >= 300) {
                const e = new Error(`Client version request failed with status ${r.status}`);
                e.status = r.status;
                throw e;
            }
            const found = extractClientVersion(r.data);
            if (!found) {
                const e = new Error("Client version response missing package metadata");
                e.status = 502;
                throw e;
            }
            dataCache.set("mc-client-version:last", found, {ttl: CLIENT_VERSION_TTL_MS});
            return found;
        }, CLIENT_VERSION_TTL_MS);
        return version;
    } catch (err) {
        if (lastKnown) {
            logger.warn("Client version fetch failed, using cached value");
            return lastKnown;
        }
        throw err;
    }
}

async function fetchMCToken(titleId) {
    const cacheKey = `mc-token:${titleId}`;
    return dataCache.getOrSetAsync(cacheKey, async () => {
        const os = process.env.OS || "iOS";
        const session = await getSession(titleId, os);
        const version = await fetchClientVersion();
        const payload = {
            user: {
                language: MC_LANGUAGE,
                languageCode: MC_LANGUAGE_CODE,
                regionCode: MC_REGION_CODE,
                token: session.SessionTicket,
                tokentype: MC_TOKEN_TYPE
            }, device: {
                applicationType: MC_APPLICATION_TYPE,
                memory: Math.floor(Math.random() * 10 ** 12) + 1,
                id: randomUUID(),
                gameVersion: version,
                platform: MC_PLATFORM,
                playFabTitleId: titleId,
                storePlatform: MC_STORE_PLATFORM,
                treatmentOverrides: null,
                type: MC_PLATFORM
            }
        };
        const r = await api.post(`${AUTH_BASE}/api/v1.0/session/start`, payload, {
            headers: {"accept-language": MC_LANGUAGE_CODE}
        });
        if (r.status < 200 || r.status >= 300) {
            const e = new Error(`Auth session start failed with status ${r.status}`);
            e.status = r.status;
            throw e;
        }
        const header = r.data?.result?.authorizationHeader;
        if (!header) {
            const e = new Error("Auth session start missing authorization header");
            e.status = 502;
            throw e;
        }
        return header;
    }, TOKEN_TTL_MS);
}

function buildDiscoveryPayload() {
    return {
        count: true,
        filter: DISCOVERY_FILTER,
        orderBy: DISCOVERY_ORDER,
        scid: DISCOVERY_SCID,
        select: DISCOVERY_SELECT,
        top: DISCOVERY_TOP
    };
}

async function fetchFeaturedServers(titleId) {
    const token = await fetchMCToken(titleId);
    const payload = buildDiscoveryPayload();
    const r = await api.post(`${DISCOVERY_BASE}/api/v2.0/discovery/blob/client`, payload, {
        headers: {
            "accept-language": MC_LANGUAGE_CODE,
            "authorization": token,
            "cache-control": "public",
            "accept-encoding": "gzip"
        }
    });
    if (r.status < 200 || r.status >= 300) {
        const e = new Error(`Discovery request failed with status ${r.status}`);
        e.status = r.status;
        logger.warn(`Discovery request failed status=${r.status}`);
        throw e;
    }
    return r.data;
}

module.exports = {fetchFeaturedServers, fetchMCToken};
