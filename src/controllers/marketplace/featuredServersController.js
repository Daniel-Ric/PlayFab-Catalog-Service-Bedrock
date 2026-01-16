const withETag = require("../../middleware/etag");
const {dataCache} = require("../../config/cache");
const {resolveTitle} = require("../../utils/titles");
const {fetchFeaturedServers} = require("../../services/featuredServersService");

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

exports.getFeaturedServers = withETag(async (_, res) => {
    const titleId = getPrimaryTitleId();
    const key = `featured-servers:v2:${titleId}`;
    const ttl = Number(process.env.FEATURED_SERVERS_TTL_MS || 5 * 60 * 1000);
    return dataCache.getOrSetAsync(key, async () => fetchFeaturedServers(titleId), ttl);
});
