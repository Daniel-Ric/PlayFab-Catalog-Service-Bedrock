const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.getDetails = withETag(async (req, res) => {
    const key = req.originalUrl;
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const item = await service.fetchDetails(req.params.alias, req.params.itemId);
    dataCache.set(key, item);
    return item;
});
