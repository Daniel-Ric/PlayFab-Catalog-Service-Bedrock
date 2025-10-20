const withETag = require("../../middleware/etag");
const { dataCache } = require("../../config/cache");
const featured = require("../../config/featuredServers");
const { resolveTitle } = require("../../utils/titles");
const { sendPlayFabRequest, buildSearchPayload, isValidItem, transformItem } = require("../../utils/playfab");

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
    const key = `featured-servers:${titleId}`;
    if (dataCache.has(key)) return dataCache.get(key);

    const ids = Array.from(new Set((featured || []).map(s => String(s.id))));
    if (ids.length === 0) {
        dataCache.set(key, []);
        return [];
    }

    const clause = ids.map(id => `id eq '${id.replace(/'/g, "''")}'`).join(" or ");
    const filter = `(${clause})`;
    const payload = buildSearchPayload({
        filter,
        search: "",
        top: Math.max(ids.length, 10),
        skip: 0
    });

    const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, process.env.OS);
    const fetched = (data.Items || []).filter(isValidItem).map(transformItem);
    const byId = new Map(fetched.map(it => [it.Id, it]));

    const out = (featured || []).map(s => ({
        name: s.name,
        id: s.id,
        items: byId.has(s.id) ? [byId.get(s.id)] : []
    }));

    dataCache.set(key, out);
    return out;
});