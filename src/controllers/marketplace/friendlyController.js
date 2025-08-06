const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.getByFriendly = withETag(async (req, res) => {
    const key = req.originalUrl;
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const item = await service.fetchByFriendly(req.params.alias, req.params.friendlyId);
    dataCache.set(key, item);
    return item;
});
