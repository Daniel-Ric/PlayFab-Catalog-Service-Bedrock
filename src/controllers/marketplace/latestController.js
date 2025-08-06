const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.getLatest = withETag(async (req, res) => {
    const key = req.originalUrl;
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const count = Math.min(parseInt(req.query.count, 10) || 10, 50);
    const items = await service.fetchLatest(req.params.alias, count, req.query);
    dataCache.set(key, items);
    return items;
});
