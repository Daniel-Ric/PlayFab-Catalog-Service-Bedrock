const withETag = require("../../middleware/etag");
const withPagination = require("../../middleware/pagination");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.getLatest = withETag(withPagination(async (req, res) => {
    const key = cacheKey(req);
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const count = Math.min(parseInt(req.query.count, 10) || 10, 50);
    const items = await service.fetchLatest(req.params.alias, count, req.query);
    dataCache.set(key, items);
    return items;
}));
