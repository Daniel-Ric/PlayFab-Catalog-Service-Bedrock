const withETag = require("../../middleware/etag");
const withPagination = require("../../middleware/pagination");
const {dataCache} = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");

exports.getAll = withETag(withPagination(async (req, res) => {
    const key = cacheKey(req);
    if (dataCache.has(key)) {
        return dataCache.get(key);
    }
    const items = await service.fetchAll(req.params.alias, req.query);
    dataCache.set(key, items);
    return items;
}));
