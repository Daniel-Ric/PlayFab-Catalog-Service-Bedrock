const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.getDetails = withETag(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const expand = req.query.expand || "";
        const item = await service.fetchDetails(req.params.alias, req.params.itemId, expand);
        return item;
    }, Number(process.env.DETAILS_TTL_MS || 2 * 60 * 1000));
});
