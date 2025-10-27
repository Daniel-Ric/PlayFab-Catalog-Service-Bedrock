const withETag = require("../../middleware/etag");
const {dataCache} = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.getRecommendations = withETag(async (req) => {
    const itemId = req.params.itemId;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "10", 10), 50));
    const key = `reco:${itemId}:${limit}`;
    return dataCache.getOrSetAsync(key, async () => {
        const result = await service.getRecommendations(itemId, limit);
        return result;
    }, Number(process.env.RECOMMENDATIONS_TTL_MS || 60 * 1000));
});
