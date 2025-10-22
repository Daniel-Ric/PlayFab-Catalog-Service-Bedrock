const withETag = require("../../middleware/etag");
const withPagination = require("../../middleware/pagination");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.getByTag = withETag(withPagination(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const items = await service.fetchByTag(req.params.alias, req.params.tag);
        return items;
    });
}));
