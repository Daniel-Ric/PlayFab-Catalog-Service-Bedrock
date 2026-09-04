// -----------------------------------------------------------------------------
//
// File: src/controllers/marketplace/availabilityController.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
//
// -----------------------------------------------------------------------------

const withETag = require("../../middleware/etag");
const {dataCache} = require("../../config/cache");
const cacheKey = require("../../utils/cacheKey");
const service = require("../../services/availabilityService");

exports.getAvailability = withETag(async (req) => {
    const key = cacheKey(req);
    const ttl = Math.max(1000, Number(process.env.AVAILABILITY_TTL_MS || 60 * 1000));
    return dataCache.getOrSetAsync(key, () => service.getAvailability(req.params.alias, req.params.itemId), ttl);
});
