module.exports = function cacheKey(req) {
    const u = new URL(req.originalUrl, "http://x");
    u.searchParams.sort();
    return `${req.method}:${u.pathname}?${u.searchParams.toString()}`;
};
