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
