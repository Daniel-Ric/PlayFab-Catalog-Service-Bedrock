const withETag = require("../../middleware/etag");
const {dataCache} = require("../../config/cache");
const {stableHash} = require("../../utils/hash");
const service = require("../../services/marketplaceService");

function toInt(v, def, min, max) {
    const n = parseInt(String(v || ""), 10);
    if (Number.isNaN(n)) return def;
    const lo = typeof min === "number" ? min : n;
    const hi = typeof max === "number" ? max : n;
    return Math.max(lo, Math.min(hi, n));
}

exports.getCreatorStats = withETag(async (req) => {
    const creatorName = req.params.creatorName;
    const latestLimit = toInt(req.query.latestLimit, 5, 0, 50);
    const topRatedLimit = toInt(req.query.topRatedLimit, 5, 0, 50);
    const months = toInt(req.query.months, 12, 1, 36);
    const includeLists = String(req.query.includeLists || "true").toLowerCase() !== "false";
    const opts = {latestLimit, topRatedLimit, months, includeLists};
    const key = `creator-stats:v2:${creatorName.toLowerCase()}:${stableHash(opts)}`;
    const ttl = Number(process.env.CREATOR_STATS_TTL_MS || 60 * 1000);
    return dataCache.getOrSetAsync(key, async () => {
        const stats = await service.getCreatorStats(creatorName, opts);
        return stats;
    }, ttl);
});