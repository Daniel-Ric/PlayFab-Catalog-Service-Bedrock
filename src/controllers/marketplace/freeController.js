const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.getFree = withETag(async (req, res) => {
    const key = req.originalUrl;
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const items = await service.fetchFree(req.params.alias);
    dataCache.set(key, items);
    return items;
});
