const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");
const cacheKey = require("../../utils/cacheKey");
const logger = require("../../config/logger"); // <— NEU

exports.getSales = withETag(async (req) => {
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, async () => {
        const data = await service.fetchSales(req.query, req.params.alias);
        const buckets = data && data.sales ? Object.keys(data.sales).length : 0;
        logger.debug(`[Sales] controller buckets=${buckets} totalItems=${data.totalItems || 0}`); // <— statt console.log
        if (!data || !data.sales || buckets === 0) {
            const e = new Error("No sales currently active.");
            e.status = 404;
            throw e;
        }
        return data;
    }, Number(process.env.SALES_TTL_MS || 2 * 60 * 1000));
});
