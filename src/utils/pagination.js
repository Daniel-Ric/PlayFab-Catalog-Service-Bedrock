// -----------------------------------------------------------------------------
//
// File: src/utils/pagination.js
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

function toInt(v, def) {
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n)) return def;
    return n;
}

function normalizeParams(query, opts = {}) {
    const defaults = {
        pageDefault: 1,
        pageSizeDefault: 24,
        pageSizeMax: 100,
        limitMax: 1000
    };
    const cfg = {...defaults, ...opts};
    const hasPage = typeof query.page !== "undefined";
    const hasPageSize = typeof query.pageSize !== "undefined";
    const hasSkip = typeof query.skip !== "undefined";
    const hasLimit = typeof query.limit !== "undefined";
    const apply = hasPage || hasPageSize || hasSkip || hasLimit;
    const page = Math.max(1, toInt(query.page, cfg.pageDefault));
    const pageSizeRaw = toInt(query.pageSize, cfg.pageSizeDefault);
    const pageSize = Math.max(1, Math.min(cfg.pageSizeMax, pageSizeRaw));
    const skipRaw = Math.max(0, toInt(query.skip, 0));
    const limitRaw = hasLimit ? Math.max(1, toInt(query.limit, pageSize)) : pageSize;
    const limit = Math.min(cfg.limitMax, limitRaw);
    const skipFromPage = (page - 1) * pageSize;
    const effectiveSkip = hasSkip ? skipRaw : skipFromPage;
    return {apply, page, pageSize, skip: effectiveSkip, limit};
}

function sliceArray(items, params) {
    const total = typeof params.totalOverride === "number" ? params.totalOverride : items.length;
    const start = Math.min(params.skip, total);
    const end = Math.min(start + params.limit, total);
    const sliced = items.slice(start, end);
    const hasNext = end < total;
    const nextPage = hasNext ? Math.floor(end / params.pageSize) + 1 : null;
    const meta = {
        total,
        page: params.page,
        pageSize: params.pageSize,
        skip: params.skip,
        limit: params.limit,
        hasNext,
        nextPage,
        start,
        end: end - 1
    };
    return {items: sliced, meta};
}

function setPaginationHeaders(res, meta) {
    res.setHeader("X-Total-Count", String(meta.total));
    res.setHeader("Content-Range", `items ${meta.start}-${meta.end >= meta.start ? meta.end : meta.start}/${meta.total}`);
}

module.exports = {normalizeParams, sliceArray, setPaginationHeaders};
