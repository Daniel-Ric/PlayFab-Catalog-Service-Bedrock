// -----------------------------------------------------------------------------
//
// File: src/controllers/marketplace/detailsController.js
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

exports.getDetails = withETag(async (req, res) => {
    const fresh = req.query.fresh === true;
    const load = () => service.fetchDetails(req.params.alias, req.params.itemId, req.query.expand || "", {fresh});
    if (fresh) {
        res.setHeader("Cache-Control", "no-store");
        return load();
    }
    const key = cacheKey(req);
    return dataCache.getOrSetAsync(key, load, Number(process.env.DETAILS_TTL_MS || 2 * 60 * 1000));
});
