const rateLimit = require("express-rate-limit");

function createRateLimiter(opts = {}) {
    const windowMs = opts.windowMs ?? 60 * 60 * 1000;
    const max = opts.max ?? 2000;
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: "Too many requests – please try again later."
    });
}

module.exports = { createRateLimiter };
