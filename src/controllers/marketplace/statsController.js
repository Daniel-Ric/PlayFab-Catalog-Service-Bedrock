// -----------------------------------------------------------------------------
//
// File: src/controllers/marketplace/statsController.js
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