// -----------------------------------------------------------------------------
//
// File: src/routes/catalogBridge.js
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

const express = require("express");
const rateLimit = require("express-rate-limit");
const {getCatalogBridgeConfig, normalizeOrigin} = require("../config/catalogBridge");
const {CatalogHandshakeStore, ensureEnabled, executeProxyPayload, executeSecurePayload, makeCookie, makeToken, validateCsrf} = require("../services/catalogBridgeService");

function maybeCors(cfg) {
    const allowed = new Set(cfg.allowedOrigins);
    return (req, res, next) => {
        if (!cfg.corsEnabled) return next();
        const origin = normalizeOrigin(req.headers.origin);
        if (origin && allowed.has(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin");
            res.setHeader("Access-Control-Allow-Methods", cfg.corsMethods.join(", "));
            res.setHeader("Access-Control-Allow-Headers", cfg.corsAllowedHeaders.join(", "));
            if (cfg.corsCredentials) res.setHeader("Access-Control-Allow-Credentials", "true");
        }
        if (req.method === "OPTIONS") return res.sendStatus(204);
        return next();
    };
}

function sendProxyResult(res, result) {
    res.status(result.status);
    if (result.contentType) res.setHeader("Content-Type", result.contentType);
    if (Buffer.isBuffer(result.body) || typeof result.body === "string") return res.send(result.body);
    return res.send(result.body);
}

function createCatalogBridgeRouter() {
    const cfg = getCatalogBridgeConfig();
    if (!cfg.enabled) return null;

    const router = express.Router();
    const handshakeStore = new CatalogHandshakeStore(cfg);
    const limiter = cfg.rateLimitEnabled
        ? rateLimit({
            windowMs: cfg.rateLimitWindowMs,
            max: cfg.rateLimitMax,
            standardHeaders: true,
            legacyHeaders: false,
            message: "Too many requests - please try again later."
        })
        : (_req, _res, next) => next();

    router.use(maybeCors(cfg));
    router.use(express.json({limit: cfg.maxBodyBytes}));
    router.options(["/api/security/csrf", "/api/security/catalog-handshake", "/api/catalog/proxy", "/api/catalog/secure"], (_req, res) => res.sendStatus(204));
    router.use(limiter);

    router.get("/api/security/csrf", (req, res, next) => {
        try {
            ensureEnabled(cfg.csrfEnabled, "Catalog bridge CSRF is disabled.");
            const csrfToken = makeToken(32);
            res.setHeader("Set-Cookie", makeCookie(cfg.csrfCookieName, csrfToken, cfg));
            res.json({ok: true, csrfToken});
        } catch (err) {
            next(err);
        }
    });

    router.get("/api/security/catalog-handshake", (_req, res, next) => {
        try {
            ensureEnabled(cfg.secureEnabled, "Catalog bridge secure proxy is disabled.");
            res.json(handshakeStore.create());
        } catch (err) {
            next(err);
        }
    });

    router.post("/api/catalog/proxy", async (req, res, next) => {
        try {
            ensureEnabled(cfg.proxyEnabled, "Catalog bridge proxy is disabled.");
            validateCsrf(req, cfg);
            const result = await executeProxyPayload(req.body || {}, cfg);
            sendProxyResult(res, result);
        } catch (err) {
            next(err);
        }
    });

    router.post("/api/catalog/secure", async (req, res, next) => {
        try {
            ensureEnabled(cfg.secureEnabled, "Catalog bridge secure proxy is disabled.");
            const result = await executeSecurePayload(req.body || {}, cfg, handshakeStore);
            res.json(result);
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = {createCatalogBridgeRouter};
