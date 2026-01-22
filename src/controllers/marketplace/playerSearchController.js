const withETag = require("../../middleware/etag");
const service = require("../../services/marketplaceService");

exports.searchPlayerMarketplace = withETag(async (req) => {
    const payload = req.body || {};
    return service.searchPlayerMarketplace(req.params.alias, payload);
});
