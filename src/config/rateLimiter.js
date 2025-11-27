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

function createRateLimiter(nameOrDefaults, maybeDefaults) {
    let cfg;
    if (typeof nameOrDefaults === "string") {
        cfg = resolveConfig(nameOrDefaults, maybeDefaults || {});
    } else {
        cfg = resolveConfig("DEFAULT", nameOrDefaults || {});
    }
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
