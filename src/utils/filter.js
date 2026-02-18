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

function buildFilter(req, creators, extra = "") {
    const parts = [];
    if (req.query.creatorName) {
        const cid = resolveCreatorId(creators, req.query.creatorName);
        parts.push(`creatorId eq '${cid.replace(/'/g, "''")}'`);
    }
    if (extra) parts.push(extra);
    return parts.join(" and ");
}

module.exports = {buildFilter};
