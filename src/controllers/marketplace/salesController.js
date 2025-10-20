const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const service = require("../../services/marketplaceService");

exports.getSales = withETag(async (req, res) => {
    const key = req.originalUrl;
    if (dataCache.has(key)) return dataCache.get(key);
    const data = await service.fetchSales(req.query);
    if (!data || !data.sales || Object.keys(data.sales).length === 0) {
        const e = new Error("No sales currently active.");
        e.status = 404;
        throw e;
    }
    dataCache.set(key, data);
    return data;
});
