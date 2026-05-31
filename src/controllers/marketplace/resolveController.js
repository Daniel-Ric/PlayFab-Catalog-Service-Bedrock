// -----------------------------------------------------------------------------
//
// File: src/controllers/marketplace/resolveController.js
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
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const searchService = require("../../services/marketplaceSearchService");
const cacheKey = require("../../utils/cacheKey");
const {stableHash} = require("../../utils/hash");

function postCacheKey(req) {
    const u = new URL(req.originalUrl, "http://x");
    u.searchParams.sort();
    return `POST:${u.pathname}?${u.searchParams.toString()}#${stableHash(req.body || {})}`;
}

exports.resolveByItemId = withETag(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const depth = parseInt(req.query.depth || "1", 10);
        const item = await service.resolveByItemId(req.params.alias, req.params.itemId, depth);
        return item;
    });
});

exports.resolveByFriendly = withETag(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const depth = parseInt(req.query.depth || "1", 10);
        const item = await service.resolveByFriendly(req.params.alias, req.params.friendlyId, depth);
        return item;
    });
});

exports.resolveBatch = withETag(async (req) => {
    const key = postCacheKey(req);
    return dataCache.getOrSetAsync(key, async () => searchService.resolveBatch(req.params.alias, req.body || {}));
});
