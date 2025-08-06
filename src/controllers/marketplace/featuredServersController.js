const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.getFeaturedServers = withETag(async (_, res) => {
    const key = "featured-servers";
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const items = await service.fetchFeaturedServers();
    dataCache.set(key, items);
    return items;
});
