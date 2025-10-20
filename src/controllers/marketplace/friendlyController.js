const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.getByFriendly = withETag(async (req, res) => {
    const key = cacheKey(req);
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const item = await service.fetchByFriendly(req.params.alias, req.params.friendlyId);
    dataCache.set(key, item);
    return item;
});
