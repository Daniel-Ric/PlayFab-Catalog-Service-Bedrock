// -----------------------------------------------------------------------------
//
// File: src/controllers/marketplace/tagController.js
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
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.getByTag = withETag(withPagination(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const items = await service.fetchByTag(req.params.alias, req.params.tag, req.query);
        return items;
    });
}));
