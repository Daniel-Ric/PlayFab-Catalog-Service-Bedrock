// -----------------------------------------------------------------------------
//
// File: src/config/catalogBridge.js
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

function boolEnv(key, def = false) {
    const raw = process.env[key];
    if (typeof raw === "undefined" || raw === "") return def;
    return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function intEnv(key, def, min = 1) {
    const raw = process.env[key];
    if (!raw) return def;
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < min) return def;
    return parsed;
}

function listEnv(key, def = []) {
    const raw = process.env[key];
    if (!raw) return def;
    return raw.split(",").map(part => part.trim()).filter(Boolean);
}

function normalizeOrigin(origin) {
    return String(origin || "").trim().replace(/\/+$/, "");
}

function getCatalogBridgeConfig() {
    const enabled = boolEnv("CATALOG_BRIDGE_ENABLED", false);
    const cookieSameSite = String(process.env.CATALOG_BRIDGE_COOKIE_SAMESITE || process.env.COOKIE_SAMESITE || "Lax").trim();
    return {
        enabled,
        proxyEnabled: boolEnv("CATALOG_BRIDGE_PROXY_ENABLED", enabled),
        secureEnabled: boolEnv("CATALOG_BRIDGE_SECURE_ENABLED", enabled),
        csrfEnabled: boolEnv("CATALOG_BRIDGE_CSRF_ENABLED", enabled),
        corsEnabled: boolEnv("CATALOG_BRIDGE_CORS_ENABLED", false),
        rateLimitEnabled: boolEnv("CATALOG_BRIDGE_RATE_LIMIT_ENABLED", enabled),
        allowedOrigins: listEnv("ALLOWED_WEB_ORIGINS").map(normalizeOrigin).filter(Boolean),
        corsMethods: listEnv("CATALOG_BRIDGE_CORS_METHODS", ["GET", "POST", "OPTIONS"]),
        corsAllowedHeaders: listEnv("CATALOG_BRIDGE_CORS_ALLOWED_HEADERS", ["Content-Type", "X-CSRF-Token"]),
        corsCredentials: boolEnv("CATALOG_BRIDGE_CORS_CREDENTIALS", true),
        upstreamOrigin: normalizeOrigin(process.env.CATALOG_UPSTREAM_ORIGIN || process.env.CATALOG_API_ORIGIN || ""),
        bearerToken: String(process.env.CATALOG_BEARER_TOKEN || process.env.CATALOG_ACCESS_TOKEN || process.env.PLAYFAB_CATALOG_BEARER_TOKEN || "").trim(),
        csrfCookieName: String(process.env.CSRF_COOKIE_NAME || "catalog_bridge_csrf").trim(),
        sessionCookieName: String(process.env.SESSION_COOKIE_NAME || "catalog_bridge_session").trim(),
        cookieSameSite,
        cookieSecure: boolEnv("CATALOG_BRIDGE_COOKIE_SECURE", process.env.NODE_ENV === "production"),
        cookieTtlMs: intEnv("CATALOG_BRIDGE_COOKIE_TTL_MS", 30 * 60 * 1000),
        handshakeTtlMs: intEnv("CATALOG_BRIDGE_HANDSHAKE_TTL_MS", 2 * 60 * 1000),
        rateLimitWindowMs: intEnv("CATALOG_BRIDGE_RATE_LIMIT_WINDOW_MS", 60 * 1000),
        rateLimitMax: intEnv("CATALOG_BRIDGE_RATE_LIMIT_MAX", 120),
        requestTimeoutMs: intEnv("CATALOG_BRIDGE_UPSTREAM_TIMEOUT_MS", intEnv("UPSTREAM_TIMEOUT_MS", 20000)),
        maxBodyBytes: intEnv("CATALOG_BRIDGE_MAX_BODY_BYTES", 1024 * 1024)
    };
}

module.exports = {
    boolEnv,
    intEnv,
    listEnv,
    normalizeOrigin,
    getCatalogBridgeConfig
};
