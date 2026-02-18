// -----------------------------------------------------------------------------
//
// File: src/controllers/marketplace/featuredPersonaController.js
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
const {dataCache} = require("../../config/cache");
const {resolveTitle} = require("../../utils/titles");
const {fetchFeaturedPersona} = require("../../services/featuredPersonaService");

function getPrimaryTitleId() {
    const v = (process.env.FEATURED_PRIMARY_ALIAS || process.env.DEFAULT_ALIAS || process.env.TITLE_ID || "").trim();
    if (!v) return "20CA2";
    try {
        return resolveTitle(v);
    } catch {
        if (/^[A-Za-z0-9]{4,10}$/i.test(v)) return v;
        return "20CA2";
    }
}

exports.getFeaturedPersona = withETag(async (_, res) => {
    const titleId = getPrimaryTitleId();
    const key = `featured-persona:v1:${titleId}`;
    const ttl = Number(process.env.MC_PERSONA_TTL_MS || 6 * 60 * 60 * 1000);
    return dataCache.getOrSetAsync(key, async () => fetchFeaturedPersona(titleId), ttl);
});
