const {resolveTitle} = require("../utils/titles");
const {sendPlayFabRequest, buildSearchPayload, isValidItem, transformItem} = require("../utils/playfab");
const {loadCreators, resolveCreatorId} = require("../utils/creators");

const PAGE_BATCH = Math.max(100, parseInt(process.env.ADV_SEARCH_BATCH || "300", 10));
const MAX_BATCHES = Math.max(1, parseInt(process.env.ADV_SEARCH_MAX_BATCHES || "10", 10));
const OS = process.env.OS || "iOS";
const creators = loadCreators();
const CONTENT_KIND_ALIASES = {
    skinpack: "skinpack",
    skinpacks: "skinpack",
    world: "world",
    worlds: "world",
    worldtemplate: "world",
    worldtemplates: "world",
    persona: "persona",
    personas: "persona"
};
const CONTENT_KIND_DEFS = {
    skinpack: {tagsAll: ["skinpack"]},
    world: {tagsAll: ["worldtemplate"]},
    persona: {excludeTags: ["worldtemplate", "skinpack"]}
};

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

function normalizeArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
}

function normalizeKindName(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildAnyFilter(field, values, prefix = "x") {
    const list = normalizeArray(values);
    if (!list.length) return "";
    return orJoin(list.map(v => `${field}/any(${prefix}:${prefix} eq '${esc(v)}')`));
}

function buildAllFilter(field, values, prefix = "x") {
    const list = normalizeArray(values);
    if (!list.length) return "";
    return andJoin(list.map(v => `${field}/any(${prefix}:${prefix} eq '${esc(v)}')`));
}

function buildContentKindFilter(values) {
    const rawKinds = normalizeArray(values);
    if (!rawKinds.length) return "";
    const unknown = [];
    const kinds = new Set();
    for (const value of rawKinds) {
        const normalized = normalizeKindName(value);
        if (!normalized) continue;
        const alias = CONTENT_KIND_ALIASES[normalized];
        if (!alias) {
            unknown.push(value);
            continue;
        }
        kinds.add(alias);
    }
    if (unknown.length) {
        const e = new Error("Unknown contentKinds.");
        e.status = 400;
        e.publicMessage = `Unknown contentKinds: ${unknown.join(", ")}. Supported values: skinpack, world, persona.`;
        throw e;
    }
    const clauses = Array.from(kinds).map(kind => {
        const def = CONTENT_KIND_DEFS[kind];
        if (!def) return "";
        const parts = [];
        if (def.tagsAny) parts.push(buildAnyFilter("tags", def.tagsAny, "t"));
        if (def.tagsAll) parts.push(buildAllFilter("tags", def.tagsAll, "t"));
        if (def.excludeTags) {
            const ex = buildAnyFilter("tags", def.excludeTags, "t");
            if (ex) parts.push(`not ${ex}`);
        }
        return andJoin(parts);
    }).filter(Boolean);
    return orJoin(clauses);
}

function buildRawFilter(raw) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) return "";
    const e = new Error("Raw filters are not supported.");
    e.status = 400;
    e.publicMessage = "Raw filters are not supported. Use tagsAny, tagsAll, excludeTags, or contentKinds.";
    throw e;
}

function toOrderBy(sort) {
    const allowed = new Set(["creationDate", "lastModifiedDate", "startDate", "endDate", "rating/totalcount", "rating/average", "title", "displayProperties/price"]);
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
    const kindClause = buildContentKindFilter(f.contentKinds);
    const tagClauses = [buildAnyFilter("tags", f.tags || f.tagsAny, "t"), buildAllFilter("tags", f.tagsAll, "t"), buildAnyFilter("tags", f.excludeTags, "t") ? `not ${buildAnyFilter("tags", f.excludeTags, "t")}` : ""];
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
    const idClauses = [];
    if (Array.isArray(f.itemIds) && f.itemIds.length) {
        idClauses.push(orJoin(f.itemIds.map(id => `id eq '${esc(id)}'`)));
    }
    const friendlyIds = normalizeArray(f.friendlyIds);
    if (friendlyIds.length) {
        const clauses = friendlyIds.map(id => `alternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq '${esc(id)}')`);
        idClauses.push(orJoin(clauses));
    }
    if (f.catalogVersion) idClauses.push(`catalogVersion eq '${esc(f.catalogVersion)}'`);
    const priceClauses = [];
    if (typeof f.priceMin === "number") priceClauses.push(`displayProperties/price ge ${Math.max(0, f.priceMin)}`);
    if (typeof f.priceMax === "number") priceClauses.push(`displayProperties/price le ${Math.max(0, f.priceMax)}`);
    if (typeof f.isFree === "boolean") priceClauses.push(f.isFree ? "displayProperties/price le 0" : "displayProperties/price gt 0");
    const dateClauses = [];
    if (f.createdFrom) {
        const from = new Date(f.createdFrom);
        if (!Number.isNaN(from.getTime())) dateClauses.push(`creationDate ge ${from.toISOString()}`);
    }
    if (f.createdTo) {
        const to = new Date(f.createdTo);
        if (!Number.isNaN(to.getTime())) dateClauses.push(`creationDate le ${to.toISOString()}`);
    }
    if (f.updatedFrom) {
        const from = new Date(f.updatedFrom);
        if (!Number.isNaN(from.getTime())) dateClauses.push(`lastModifiedDate ge ${from.toISOString()}`);
    }
    if (f.updatedTo) {
        const to = new Date(f.updatedTo);
        if (!Number.isNaN(to.getTime())) dateClauses.push(`lastModifiedDate le ${to.toISOString()}`);
    }
    if (f.startFrom) {
        const from = new Date(f.startFrom);
        if (!Number.isNaN(from.getTime())) dateClauses.push(`startDate ge ${from.toISOString()}`);
    }
    if (f.startTo) {
        const to = new Date(f.startTo);
        if (!Number.isNaN(to.getTime())) dateClauses.push(`startDate le ${to.toISOString()}`);
    }
    if (f.endFrom) {
        const from = new Date(f.endFrom);
        if (!Number.isNaN(from.getTime())) dateClauses.push(`endDate ge ${from.toISOString()}`);
    }
    if (f.endTo) {
        const to = new Date(f.endTo);
        if (!Number.isNaN(to.getTime())) dateClauses.push(`endDate le ${to.toISOString()}`);
    }
    const typeClauses = [orJoin(normalizeArray(f.contentTypes).map(ct => `contentType eq '${esc(ct)}'`)), normalizeArray(f.excludeContentTypes).length ? `not ${orJoin(normalizeArray(f.excludeContentTypes).map(ct => `contentType eq '${esc(ct)}'`))}` : ""];
    const platformClauses = [buildAnyFilter("platforms", f.platforms, "p"), normalizeArray(f.excludePlatforms).length ? `not ${buildAnyFilter("platforms", f.excludePlatforms, "p")}` : ""];
    const ratingClauses = [];
    if (typeof f.ratingMin === "number") ratingClauses.push(`rating/average ge ${Math.max(0, f.ratingMin)}`);
    if (typeof f.ratingMax === "number") ratingClauses.push(`rating/average le ${Math.max(0, f.ratingMax)}`);
    if (typeof f.ratingCountMin === "number") ratingClauses.push(`rating/totalcount ge ${Math.max(0, f.ratingCountMin)}`);
    const customFilter = buildRawFilter(f.raw);
    return andJoin([kindClause, ...tagClauses, orJoin(creatorClauses), orJoin(idClauses), ...priceClauses, ...dateClauses, ...typeClauses, ...platformClauses, ...ratingClauses, customFilter]);
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

function buildSearchQuery(body) {
    if (!body) return "";
    const base = body.search || body.query || "";
    const mode = String(body.queryMode || "").toLowerCase();
    const q = Array.isArray(base) ? base.filter(Boolean).join(" ") : String(base || "");
    const trimmed = q.trim().slice(0, 200);
    if (!trimmed) return "";
    if (mode === "exact" || mode === "phrase") return `"${trimmed}"`;
    if (body.exact === true) return `"${trimmed}"`;
    return trimmed;
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
            value, count
        })).sort((a, b) => b.count - a.count).slice(0, 50),
        creators: Array.from(creators.entries()).map(([value, count]) => ({
            value, count
        })).sort((a, b) => b.count - a.count).slice(0, 50),
        contentTypes: Array.from(typeMap.entries()).map(([value, count]) => ({
            value, count
        })).sort((a, b) => b.count - a.count),
        price: Array.from(priceBuckets.entries()).map(([bucket, count]) => ({bucket, count}))
    };
}

exports.advancedSearch = async (alias, body, {page, pageSize}) => {
    const titleId = resolveTitle(alias);
    const filter = buildFilter(alias, body || {});
    const orderBy = toOrderBy(body && body.sort);
    const q = buildSearchQuery(body);
    const all = await searchLoop(titleId, filter, q, orderBy);
    const facets = buildFacets(all);
    const {items, meta} = paginate(all, page, pageSize);
    return {items, meta, facets};
};

exports._internals = {buildFilter, buildContentKindFilter, buildRawFilter};
