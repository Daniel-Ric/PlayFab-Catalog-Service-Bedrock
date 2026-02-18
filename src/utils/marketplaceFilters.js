// -----------------------------------------------------------------------------
//
// File: src/utils/marketplaceFilters.js
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

function andFilter(a, b) {
    const A = (a || "").trim();
    const B = (b || "").trim();
    if (A && B) return `(${A}) and (${B})`;
    return A || B || "";
}

function buildPlayerMarketplaceFilter(filter, creatorName, creators = []) {
    const base = (filter || "").trim();
    const name = String(creatorName || "").trim();
    if (!name) return base;
    const cid = resolveCreatorId(creators, name);
    const creatorFilter = `creatorId eq '${cid.replace(/'/g, "''")}'`;
    return andFilter(base, creatorFilter);
}

module.exports = {buildPlayerMarketplaceFilter};
