const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.getByTag = withETag(async (req, res) => {
    const key = req.originalUrl;
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const items = await service.fetchByTag(req.params.alias, req.params.tag);
    dataCache.set(key, items);
    return items;
});
