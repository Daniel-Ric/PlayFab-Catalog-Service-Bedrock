const withETag = require("../../middleware/etag");
const withPagination = require("../../middleware/pagination");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.getLatest = withETag(withPagination(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const count = Math.min(parseInt(req.query.count, 10) || 10, 50);
        const items = await service.fetchLatest(req.params.alias, count, req.query);
        return items;
    });
}));
