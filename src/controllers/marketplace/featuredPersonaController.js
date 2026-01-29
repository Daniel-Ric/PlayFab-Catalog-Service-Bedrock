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
