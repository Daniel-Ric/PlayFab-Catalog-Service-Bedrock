const withETag = require("../../middleware/etag");
const {dataCache} = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.resolveByItemId = withETag(async (req, res) => {
    const key = cacheKey(req);
    if (dataCache.has(key)) return dataCache.get(key);
    const depth = parseInt(req.query.depth || "1", 10);
    const item = await service.resolveByItemId(req.params.alias, req.params.itemId, depth);
    dataCache.set(key, item);
    return item;
});

exports.resolveByFriendly = withETag(async (req, res) => {
    const key = cacheKey(req);
    if (dataCache.has(key)) return dataCache.get(key);
    const depth = parseInt(req.query.depth || "1", 10);
    const item = await service.resolveByFriendly(req.params.alias, req.params.friendlyId, depth);
    dataCache.set(key, item);
    return item;
});
