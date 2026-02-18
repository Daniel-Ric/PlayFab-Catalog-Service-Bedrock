// -----------------------------------------------------------------------------
//
// File: src/controllers/marketplace/searchAdvancedController.js
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
const cacheKey = require("../../utils/cacheKey");
const {stableHash} = require("../../utils/hash");
const service = require("../../services/advancedSearchService");

function buildPostCacheKey(req) {
    const u = new URL(req.originalUrl, "http://x");
    u.searchParams.sort();
    const bodyHash = stableHash(req.body || {});
    return `POST:${u.pathname}?${u.searchParams.toString()}#${bodyHash}`;
}

exports.searchAdvanced = withETag(async (req) => {
    const ttl = Number(process.env.ADV_SEARCH_TTL_MS || 60 * 1000);
    const key = buildPostCacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const alias = req.params.alias;
        const page = Math.max(1, parseInt(req.query.page || "1", 10));
        const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize || "24", 10)));
        const result = await service.advancedSearch(alias, req.body || {}, {page, pageSize});
        return result;
    }, ttl);
});
