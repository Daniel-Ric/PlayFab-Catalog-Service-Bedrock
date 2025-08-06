const withETag  = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service    = require("../../services/marketplaceService");

exports.compare = withETag(async (req, res) => {
    const key = req.originalUrl;
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }

    const { creatorName } = req.params;
    const diff = await service.fetchCompare(creatorName);
    dataCache.set(key, diff);
    return diff;
});
