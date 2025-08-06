const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.search = withETag(async (req, res) => {
    const key = req.originalUrl;
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const { creatorName, keyword } = req.query;
    const items = await service.search(req.params.alias, creatorName, keyword);
    dataCache.set(key, items);
    return items;
});
