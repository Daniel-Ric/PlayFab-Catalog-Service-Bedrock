// -----------------------------------------------------------------------------
//
// File: src/middleware/pagination.js
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

const { normalizeParams, sliceArray, setPaginationHeaders } = require("../utils/pagination");

function withPagination(handler, opts = {}) {
    return async (req, res, next) => {
        try {
            const params = normalizeParams(req.query, opts);
            const shouldPaginate = params.apply;
            const result = await handler(req, res);

            if (!shouldPaginate) {
                return result;
            }

            if (Array.isArray(result)) {
                const { items, meta } = sliceArray(result, params);
                setPaginationHeaders(res, meta);
                return { items, meta };
            }

            if (result && Array.isArray(result.items)) {
                const total = typeof result.total === "number" ? result.total : result.items.length;
                const { items, meta } = sliceArray(result.items, { ...params, totalOverride: total });
                setPaginationHeaders(res, meta);
                return { ...result, items, meta, total: meta.total };
            }

            return result;
        } catch (e) {
            next(e);
        }
    };
}

module.exports = withPagination;
