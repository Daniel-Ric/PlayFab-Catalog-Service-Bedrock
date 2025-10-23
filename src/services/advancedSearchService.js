const {resolveTitle} = require("../utils/titles");
const {sendPlayFabRequest, buildSearchPayload, isValidItem, transformItem} = require("../utils/playfab");
const {loadCreators, resolveCreatorId} = require("../utils/creators");

const PAGE_BATCH = Math.max(100, parseInt(process.env.ADV_SEARCH_BATCH || "300", 10));
const MAX_BATCHES = Math.max(1, parseInt(process.env.ADV_SEARCH_MAX_BATCHES || "10", 10));
const OS = process.env.OS || "iOS";
const creators = loadCreators();

function esc(v) {
    return String(v).replace(/'/g, "''");
}

function andJoin(parts) {
    return parts.filter(Boolean).join(" and ");
}

function orJoin(parts) {
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0];
    return `(${parts.join(" or ")})`;
}

function toOrderBy(sort) {
    const allowed = new Set(["creationDate", "rating/totalcount", "title", "displayProperties/price"]);
    if (!Array.isArray(sort) || !sort.length) return "creationDate desc";
    const mapped = [];
    for (const s of sort) {
        const f = String(s.field || "").toLowerCase();
        const dir = (String(s.dir || "desc").toLowerCase() === "asc") ? "asc" : "desc";
        const fld = allowed.has(f) ? f : "creationDate";
        mapped.push(`${fld} ${dir}`);
    }
    return mapped.join(", ");
}

function buildFilter(alias, body) {
    const f = body.filters || {};
    const tagClauses = Array.isArray(f.tags) ? f.tags.filter(Boolean).map(t => `tags/any(t:t eq '${esc(t)}')`) : [];
    const creatorClauses = [];
    if (Array.isArray(f.creatorIds) && f.creatorIds.length) {
        creatorClauses.push(orJoin(f.creatorIds.map(id => `creatorId eq '${esc(id)}'`)));
    }
    if (f.creatorName) {
        try {
            const id = resolveCreatorId(creators, f.creatorName);
            creatorClauses.push(`creatorId eq '${esc(id)}'`);
        } catch {
        }
    }
    const priceClauses = [];
    if (typeof f.priceMin === "number") priceClauses.push(`displayProperties/price ge ${Math.max(0, f.priceMin)}`);
    if (typeof f.priceMax === "number") priceClauses.push(`displayProperties/price le ${Math.max(0, f.priceMax)}`);
    const dateClauses = [];
    if (f.createdFrom) dateClauses.push(`creationDate ge ${new Date(f.createdFrom).toISOString()}`);
    if (f.createdTo) dateClauses.push(`creationDate le ${new Date(f.createdTo).toISOString()}`);
    const typeClauses = Array.isArray(f.contentTypes) ? f.contentTypes.filter(Boolean).map(ct => `contentType eq '${esc(ct)}'`) : [];
    return andJoin([...tagClauses, orJoin(creatorClauses), ...priceClauses, ...dateClauses, orJoin(typeClauses)]);
}

async function searchLoop(titleId, filter, search, orderBy) {
    const out = [];
    for (let i = 0, skip = 0; i < MAX_BATCHES; i += 1, skip += PAGE_BATCH) {
        const payload = buildSearchPayload({filter, search, top: PAGE_BATCH, skip, orderBy});
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 3, OS);
        const items = (data.Items || []).filter(isValidItem).map(transformItem);
        if (!items.length) break;
        out.push(...items);
        if (items.length < PAGE_BATCH) break;
    }
    return out;
}

function paginate(items, page, pageSize) {
    const total = items.length;
    const start = Math.min((page - 1) * pageSize, total);
    const end = Math.min(start + pageSize, total);
    return {
        items: items.slice(start, end), meta: {
            total,
            page,
            pageSize,
            hasNext: end < total,
            nextPage: end < total ? page + 1 : null,
            start,
            end: Math.max(start, end - 1)
        }
    };
}

function buildFacets(all) {
    const tags = new Map();
    const creators = new Map();
    const typeMap = new Map();
    const prices = [0, 310, 620, 990, 1990, 3990];
    const priceBuckets = new Map();
    for (const it of all) {
        const tgs = Array.isArray(it.Tags) ? it.Tags : [];
        for (const t of tgs) tags.set(t, (tags.get(t) || 0) + 1);
        const cn = it.DisplayProperties && it.DisplayProperties.creatorName ? it.DisplayProperties.creatorName : "Unknown";
        creators.set(cn, (creators.get(cn) || 0) + 1);
        const ct = it.ContentType || it.contentType || "";
        if (ct) typeMap.set(ct, (typeMap.get(ct) || 0) + 1);
        const price = it.DisplayProperties && typeof it.DisplayProperties.price === "number" ? it.DisplayProperties.price : null;
        if (typeof price === "number") {
            let bucket = `${prices[0]}-${prices[1]}`;
            for (let i = 0; i < prices.length - 1; i++) {
                if (price >= prices[i] && price < prices[i + 1]) {
                    bucket = `${prices[i]}-${prices[i + 1] - 1}`;
                    break;
                }
                if (price >= prices[prices.length - 1]) bucket = `${prices[prices.length - 1]}+`;
            }
            priceBuckets.set(bucket, (priceBuckets.get(bucket) || 0) + 1);
        }
    }
    return {
        tags: Array.from(tags.entries()).map(([value, count]) => ({
            value,
            count
        })).sort((a, b) => b.count - a.count).slice(0, 50),
        creators: Array.from(creators.entries()).map(([value, count]) => ({
            value,
            count
        })).sort((a, b) => b.count - a.count).slice(0, 50),
        contentTypes: Array.from(typeMap.entries()).map(([value, count]) => ({
            value,
            count
        })).sort((a, b) => b.count - a.count),
        price: Array.from(priceBuckets.entries()).map(([bucket, count]) => ({bucket, count}))
    };
}

exports.advancedSearch = async (alias, body, {page, pageSize}) => {
    const titleId = resolveTitle(alias);
    const filter = buildFilter(alias, body || {});
    const orderBy = toOrderBy(body && body.sort);
    const q = body && body.query ? `"${String(body.query).slice(0, 200)}"` : "";
    const all = await searchLoop(titleId, filter, q, orderBy);
    const facets = buildFacets(all);
    const {items, meta} = paginate(all, page, pageSize);
    return {items, meta, facets};
};
