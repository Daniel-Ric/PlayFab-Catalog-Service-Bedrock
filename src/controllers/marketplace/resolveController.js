const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

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
