// -----------------------------------------------------------------------------
//
// File: src/utils/filter.js
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

const {resolveCreatorId} = require("./creators");

const DATE_FILTER_FIELDS = [
    ["creationDate", "CreationDate"],
    ["lastModifiedDate", "LastModifiedDate"],
    ["startDate", "StartDate"]
];

function normalizeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function buildDateFilter(query = {}) {
    const parts = [];
    for (const [queryName, playFabName] of DATE_FILTER_FIELDS) {
        const from = normalizeDate(query[`${queryName}From`]);
        const to = normalizeDate(query[`${queryName}To`]);
        if (from) parts.push(`${playFabName} ge ${from}`);
        if (to) parts.push(`${playFabName} le ${to}`);
    }
    return parts.join(" and ");
}

function buildFilter(req, creators, extra = "") {
    const parts = [];
    if (req.query.creatorName) {
        const cid = resolveCreatorId(creators, req.query.creatorName);
        parts.push(`creatorId eq '${cid.replace(/'/g, "''")}'`);
    }
    const dateFilter = buildDateFilter(req.query);
    if (dateFilter) parts.push(dateFilter);
    if (extra) parts.push(extra);
    return parts.join(" and ");
}

function dateValue(item, field) {
    return item?.[field] || item?.rawItem?.[field] || null;
}

function matchesDateFilters(item, query = {}) {
    for (const [queryName, playFabName] of DATE_FILTER_FIELDS) {
        const from = normalizeDate(query[`${queryName}From`]);
        const to = normalizeDate(query[`${queryName}To`]);
        if (!from && !to) continue;
        const value = normalizeDate(dateValue(item, playFabName));
        if (!value) return false;
        if (from && value < from) return false;
        if (to && value > to) return false;
    }
    return true;
}

function filterItemsByDate(items, query = {}) {
    if (!Array.isArray(items)) return [];
    if (!buildDateFilter(query)) return items;
    return items.filter(item => matchesDateFilters(item, query));
}

module.exports = {buildFilter, buildDateFilter, filterItemsByDate};
