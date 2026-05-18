// -----------------------------------------------------------------------------
//
// File: src/services/catalogBridgeService.js
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

const crypto = require("crypto");
const axios = require("axios");

function badRequest(message) {
    const err = new Error(message);
    err.status = 400;
    return err;
}

function ensureEnabled(enabled, message = "Catalog bridge feature is disabled.") {
    if (enabled) return;
    const err = new Error(message);
    err.status = 404;
    throw err;
}

function parseCookies(header) {
    const out = {};
    for (const part of String(header || "").split(";")) {
        const index = part.indexOf("=");
        if (index < 0) continue;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key) out[key] = decodeURIComponent(value);
    }
    return out;
}

function makeToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
}

function makeCookie(name, value, cfg) {
    const parts = [
        `${name}=${encodeURIComponent(value)}`,
        "Path=/",
        "HttpOnly",
        `Max-Age=${Math.max(1, Math.floor(cfg.cookieTtlMs / 1000))}`,
        `SameSite=${cfg.cookieSameSite || "Lax"}`
    ];
    if (cfg.cookieSecure) parts.push("Secure");
    return parts.join("; ");
}

function validateCsrf(req, cfg, tokenOverride) {
    if (!cfg.csrfEnabled) return;
    const expected = tokenOverride || parseCookies(req.headers.cookie)[cfg.csrfCookieName];
    const actual = req.headers["x-csrf-token"];
    const expectedBuffer = Buffer.from(String(expected || ""));
    const actualBuffer = Buffer.from(String(actual || ""));
    if (!expectedBuffer.length || expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
        const err = new Error("Invalid CSRF token.");
        err.status = 403;
        throw err;
    }
}

function validateCatalogUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) throw badRequest("url is required.");
    if (!rawUrl.startsWith("/catalog/")) throw badRequest("Only relative /catalog/... URLs are allowed.");
    if (rawUrl.startsWith("//")) throw badRequest("Absolute URLs are not allowed.");
    const parsed = new URL(rawUrl, "http://catalog-bridge.local");
    if (parsed.origin !== "http://catalog-bridge.local") throw badRequest("Absolute URLs are not allowed.");
    if (!parsed.pathname.startsWith("/catalog/")) throw badRequest("Only /catalog/... URLs are allowed.");
    if (parsed.pathname.replace(/\/+$/, "").toLowerCase() === "/catalog/login") {
        const err = new Error("/catalog/login cannot be proxied.");
        err.status = 403;
        throw err;
    }
    return `${parsed.pathname}${parsed.search}`;
}

function normalizeMethod(method) {
    const value = String(method || "GET").trim().toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value)) throw badRequest("Unsupported proxy method.");
    return value;
}

function sanitizeHeaders(headers = {}) {
    const out = {};
    for (const [key, value] of Object.entries(headers || {})) {
        const name = String(key || "").trim();
        if (!name) continue;
        const lower = name.toLowerCase();
        if (["authorization", "host", "cookie", "content-length", "connection", "transfer-encoding"].includes(lower)) continue;
        out[name] = value;
    }
    return out;
}

function buildProxyRequest(payload, cfg, options = {}) {
    if (options.requireProxyEnabled !== false) {
        ensureEnabled(cfg.proxyEnabled, "Catalog bridge proxy is disabled.");
    }
    if (!cfg.upstreamOrigin) {
        const err = new Error("CATALOG_UPSTREAM_ORIGIN is not configured.");
        err.status = 503;
        throw err;
    }
    if (!cfg.bearerToken) {
        const err = new Error("Catalog bearer token is not configured.");
        err.status = 503;
        throw err;
    }
    const relativeUrl = validateCatalogUrl(payload?.url);
    return {
        url: `${cfg.upstreamOrigin}${relativeUrl}`,
        method: normalizeMethod(payload?.method),
        headers: {
            ...sanitizeHeaders(payload?.headers),
            Authorization: `Bearer ${cfg.bearerToken}`
        },
        data: typeof payload?.body === "undefined" ? undefined : payload.body,
        timeout: cfg.requestTimeoutMs,
        maxBodyLength: cfg.maxBodyBytes,
        validateStatus: () => true
    };
}

async function executeProxyPayload(payload, cfg, options = {}) {
    const upstream = await axios.request(buildProxyRequest(payload, cfg, options));
    const contentType = upstream.headers?.["content-type"] || "application/octet-stream";
    return {
        status: upstream.status,
        contentType,
        body: upstream.data
    };
}

class CatalogHandshakeStore {
    constructor(cfg) {
        this.cfg = cfg;
        this.items = new Map();
        this.timer = setInterval(() => this.cleanup(), Math.max(1000, Math.floor(cfg.handshakeTtlMs / 2)));
        this.timer.unref?.();
    }

    cleanup(now = Date.now()) {
        for (const [key, value] of this.items.entries()) {
            if (value.expiresAt <= now) this.items.delete(key);
        }
    }

    create() {
        this.cleanup();
        const ecdh = crypto.createECDH("prime256v1");
        ecdh.generateKeys();
        const keyId = makeToken(18);
        const csrfToken = makeToken(32);
        const publicKey = ecdh.getPublicKey().toString("base64");
        this.items.set(keyId, {
            privateKey: ecdh.getPrivateKey(),
            csrfToken,
            expiresAt: Date.now() + this.cfg.handshakeTtlMs
        });
        return {keyId, publicKey, csrfToken};
    }

    take(keyId) {
        this.cleanup();
        const item = this.items.get(keyId);
        if (!item) return null;
        this.items.delete(keyId);
        return item;
    }
}

function deriveSecureKey(serverPrivateKey, clientPublicKey, keyId) {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(serverPrivateKey);
    const sharedSecret = ecdh.computeSecret(Buffer.from(String(clientPublicKey || ""), "base64"));
    return crypto.hkdfSync("sha256", sharedSecret, Buffer.from(String(keyId)), Buffer.from("catalog-bridge-v1"), 32);
}

function decryptSecurePayload(body, handshake) {
    try {
        const key = deriveSecureKey(handshake.privateKey, body?.clientPublicKey, body?.keyId);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(String(body?.iv || ""), "base64"));
        decipher.setAuthTag(Buffer.from(String(body?.tag || ""), "base64"));
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(String(body?.data || ""), "base64")),
            decipher.final()
        ]);
        return JSON.parse(plaintext.toString("utf8"));
    } catch {
        throw badRequest("Invalid encrypted catalog payload.");
    }
}

function encryptSecurePayload(payload, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([
        cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
        cipher.final()
    ]);
    return {
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: data.toString("base64")
    };
}

async function executeSecurePayload(body, cfg, store) {
    ensureEnabled(cfg.secureEnabled, "Catalog bridge secure proxy is disabled.");
    const keyId = String(body?.keyId || "");
    const handshake = store.take(keyId);
    if (!handshake) throw badRequest("Invalid or expired handshake.");
    const proxyPayload = decryptSecurePayload(body, handshake);
    if (cfg.csrfEnabled && proxyPayload.csrfToken !== handshake.csrfToken) {
        const err = new Error("Invalid CSRF token.");
        err.status = 403;
        throw err;
    }
    const result = await executeProxyPayload(proxyPayload, cfg, {requireProxyEnabled: false});
    const key = deriveSecureKey(handshake.privateKey, body?.clientPublicKey, keyId);
    return {
        keyId,
        ...encryptSecurePayload(result, key)
    };
}

module.exports = {
    CatalogHandshakeStore,
    ensureEnabled,
    makeCookie,
    makeToken,
    parseCookies,
    validateCsrf,
    validateCatalogUrl,
    buildProxyRequest,
    executeProxyPayload,
    executeSecurePayload,
    _internals: {
        decryptSecurePayload,
        deriveSecureKey,
        encryptSecurePayload,
        sanitizeHeaders
    }
};
