// -----------------------------------------------------------------------------
//
// File: src/controllers/marketplace/searchController.js
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
const withPagination = require("../../middleware/pagination");
const {dataCache} = require("../../config/cache");
const service = require("../../services/marketplaceService");
const searchService = require("../../services/marketplaceSearchService");
const cacheKey = require("../../utils/cacheKey");
const {stableHash} = require("../../utils/hash");

function postCacheKey(req) {
    const u = new URL(req.originalUrl, "http://x");
    u.searchParams.sort();
    return `POST:${u.pathname}?${u.searchParams.toString()}#${stableHash(req.body || {})}`;
}

exports.search = withETag(withPagination(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const {creatorName, keyword} = req.query;
        const items = await service.search(req.params.alias, creatorName, keyword, req.query);
        return items;
    });
}));

exports.searchItems = withETag(async (req) => {
    const ttl = Number(process.env.MARKETPLACE_SEARCH_ITEMS_TTL_MS || 30 * 1000);
    const key = postCacheKey(req);
    return dataCache.getOrSetAsync(key, async () => searchService.searchItems(req.params.alias, req.body || {}), ttl);
});

exports.searchStore = withETag(async (req) => {
    const ttl = Number(process.env.MARKETPLACE_SEARCH_STORE_TTL_MS || 30 * 1000);
    const key = postCacheKey(req);
    return dataCache.getOrSetAsync(key, async () => searchService.searchStore(req.params.alias, req.body || {}), ttl);
});

exports.suggest = withETag(async (req) => {
    const ttl = Number(process.env.MARKETPLACE_SEARCH_SUGGEST_TTL_MS || 30 * 1000);
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => searchService.suggest(req.params.alias, req.query || {}), ttl);
});

exports.localizedSearch = withETag(async (req) => {
    const ttl = Number(process.env.MARKETPLACE_SEARCH_LOCALIZED_TTL_MS || 30 * 1000);
    const key = postCacheKey(req);
    return dataCache.getOrSetAsync(key, async () => searchService.localizedSearch(req.params.alias, req.body || {}), ttl);
});

exports.searchAudit = withETag(async (req) => {
    const ttl = Number(process.env.MARKETPLACE_SEARCH_AUDIT_TTL_MS || 60 * 1000);
    const key = postCacheKey(req);
    return dataCache.getOrSetAsync(key, async () => searchService.audit(req.params.alias, req.body || {}), ttl);
});
