const axios = require("axios");
const http = require("http");
const https = require("https");
const logger = require("../config/logger");
const {fetchMCToken} = require("./featuredServersService");

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

const STORE_BASE = process.env.MC_STORE_BASE || "https://store.mktpl.minecraft-services.net";
const PERSONA_PAGE = (process.env.MC_PERSONA_PAGE || "DressingRoom_PersonaProfile").trim();
const PERSONA_LIST_VERSION = (process.env.MC_PERSONA_LIST_VERSION || "3108f120-906b-401d-af90-942cc5f73551").trim();
const PERSONA_INVENTORY_VERSION = (process.env.MC_PERSONA_INVENTORY_VERSION || "1/NA==").trim();
const PERSONA_LANGUAGE = process.env.MC_LANGUAGE_CODE || "en-US";

function buildPersonaProfilePayload() {
    return {
        entitlements: [],
        inventoryVersion: PERSONA_INVENTORY_VERSION,
        listVersion: PERSONA_LIST_VERSION,
        recentlyViewed: []
    };
}

async function fetchFeaturedPersona(titleId) {
    const token = await fetchMCToken(titleId);
    const payload = buildPersonaProfilePayload();
    const page = PERSONA_PAGE || "DressingRoom_PersonaProfile";
    const url = `${STORE_BASE}/api/v1.0/layout/pages/${encodeURIComponent(page)}`;
    const r = await api.post(url, payload, {
        headers: {"authorization": token, "accept-language": PERSONA_LANGUAGE}
    });
    if (r.status < 200 || r.status >= 300) {
        const e = new Error(`Persona layout request failed with status ${r.status}`);
        e.status = r.status;
        logger.warn(`Persona layout request failed status=${r.status}`);
        throw e;
    }
    return r.data;
}

module.exports = {fetchFeaturedPersona, buildPersonaProfilePayload};
