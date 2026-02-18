// -----------------------------------------------------------------------------
//
// File: src/controllers/marketplace/salesController.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
// No partnership, approval, or official relationship with Mojang AB or Microsoft is implied.
//
// All names, logos, brands, trademarks, service marks, and registered trademarks are the
// property of their respective owners and are used strictly for identification/reference only.
// This project does not claim ownership of third-party IP and provides no license to use it.
//
// -----------------------------------------------------------------------------

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
