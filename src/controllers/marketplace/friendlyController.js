const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.getByFriendly = withETag(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const item = await service.fetchByFriendly(req.params.alias, req.params.friendlyId);
        return item;
    });
});
