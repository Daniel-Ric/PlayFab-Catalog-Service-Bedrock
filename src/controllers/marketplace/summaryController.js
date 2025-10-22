const withETag = require("../../middleware/etag");
const withPagination = require("../../middleware/pagination");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.getSummary = withETag(withPagination(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const items = await service.fetchSummary(req.params.alias);
        return items;
    }, Number(process.env.SUMMARY_TTL_MS || 5 * 60 * 1000));
}));
