// -----------------------------------------------------------------------------
//
// File: src/config/rateLimiter.js
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

const rateLimit = require("express-rate-limit");

const rateLimitEnabled = String(process.env.RATE_LIMIT_ENABLE || process.env.RATE_LIMIT_ENABLED || "").toLowerCase() === "true";

function readIntEnv(key, def) {
    const raw = process.env[key];
    if (!raw) return def;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return def;
    return n;
}

function resolveConfig(name, defaults) {
    const baseWindow = typeof defaults.windowMs === "number" ? defaults.windowMs : 60 * 60 * 1000;
    const baseMax = typeof defaults.max === "number" ? defaults.max : 2000;
    if (!rateLimitEnabled) return {windowMs: baseWindow, max: baseMax};
    const suffix = String(name || "DEFAULT").toUpperCase();
    const windowMs = readIntEnv(`RATE_LIMIT_${suffix}_WINDOW_MS`, readIntEnv("RATE_LIMIT_WINDOW_MS", baseWindow));
    const max = readIntEnv(`RATE_LIMIT_${suffix}_MAX`, readIntEnv("RATE_LIMIT_MAX", baseMax));
    return {windowMs, max};
}

const hardLoginWindowMs = readIntEnv("RATE_LIMIT_LOGIN_BURST_WINDOW_MS", 10 * 1000);
const hardLoginMax = readIntEnv("RATE_LIMIT_LOGIN_BURST_MAX", 50);

const hardLoginLimiter = rateLimit({
    windowMs: hardLoginWindowMs,
    max: hardLoginMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests – please try again later."
});

function createRateLimiter(nameOrDefaults, maybeDefaults) {
    let cfgName = "DEFAULT";
    let defaults = {};
    if (typeof nameOrDefaults === "string") {
        cfgName = nameOrDefaults;
        defaults = maybeDefaults || {};
    } else {
        defaults = nameOrDefaults || {};
    }

    if (String(cfgName).toUpperCase() === "LOGIN") {
        const cfg = resolveConfig("LOGIN", defaults);
        if (!rateLimitEnabled) {
            return hardLoginLimiter;
        }
        const loginLimiter = rateLimit({
            windowMs: cfg.windowMs,
            max: cfg.max,
            standardHeaders: true,
            legacyHeaders: false,
            message: "Too many requests – please try again later."
        });
        return (req, res, next) => {
            loginLimiter(req, res, err => {
                if (err) return next(err);
                hardLoginLimiter(req, res, next);
            });
        };
    }

    if (!rateLimitEnabled) {
        return (_req, _res, next) => next();
    }

    const cfg = resolveConfig(cfgName, defaults);
    return rateLimit({
        windowMs: cfg.windowMs,
        max: cfg.max,
        standardHeaders: true,
        legacyHeaders: false,
        message: "Too many requests – please try again later."
    });
}

function createOptionalRateLimiter(name, defaults = {}) {
    if (!rateLimitEnabled) {
        return (_req, _res, next) => next();
    }
    const cfg = resolveConfig(name, defaults);
    return rateLimit({
        windowMs: cfg.windowMs,
        max: cfg.max,
        standardHeaders: true,
        legacyHeaders: false,
        message: "Too many requests – please try again later."
    });
}

module.exports = {createRateLimiter, createOptionalRateLimiter, rateLimitEnabled};
