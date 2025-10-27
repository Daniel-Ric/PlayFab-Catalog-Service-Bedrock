const withETag = require("../../middleware/etag");
const {dataCache} = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.getCreatorStats = withETag(async (req) => {
    const creatorName = req.params.creatorName;
    const key = `creator-stats:${creatorName.toLowerCase()}`;
    return dataCache.getOrSetAsync(key, async () => {
        const stats = await service.getCreatorStats(creatorName);
        return stats;
    }, Number(process.env.CREATOR_STATS_TTL_MS || 60 * 1000));
});
