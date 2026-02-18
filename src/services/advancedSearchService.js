// -----------------------------------------------------------------------------
//
// File: src/services/advancedSearchService.js
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

const {resolveTitle} = require("../utils/titles");
const {sendPlayFabRequest, buildSearchPayload, isValidItem, transformItem} = require("../utils/playfab");

const PAGE_BATCH = Math.max(100, parseInt(process.env.ADV_SEARCH_BATCH || "300", 10));
const MAX_BATCHES = Math.max(1, parseInt(process.env.ADV_SEARCH_MAX_BATCHES || "120", 10));
const OS = process.env.OS || "iOS";


const CONTENT_KIND_ALIASES = {
    skinpack: "skinpack",
    skinpacks: "skinpack",
    world: "world",
    worlds: "world",
    worldtemplate: "world",
    worldtemplates: "world",
    persona: "persona",
    personas: "persona",
    addon: "addon",
    addons: "addon"
};

const CONTENT_KIND_DEFS = {
    skinpack: {contentTypes: ["MarketplaceDurableCatalog_V1.2"], tagsAll: ["skinpack"]},
    world: {contentTypes: ["MarketplaceDurableCatalog_V1.2"], tagsAll: ["worldtemplate"]},
    persona: {contentTypes: ["PersonaDurable"]},
    addon: {contentTypes: ["MarketplaceDurableCatalog_V1.2"], tagsAll: ["addon"]}
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
    if (Array.isArray(value)) return value.map(v => String(v || "").trim()).filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
}

function normalizeBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        if (value.toLowerCase() === "true") return true;
        if (value.toLowerCase() === "false") return false;
    }
    return null;
}

function toFiniteNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function quoteString(value) {
    return `'${esc(value)}'`;
}

function parseDateIso(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function parseDateRange(field, range) {
    if (!range || typeof range !== "object") return [];
    const parts = [];
    const from = parseDateIso(range.from);
    const to = parseDateIso(range.to);
    if (from) parts.push(`${field} ge ${from}`);
    if (to) parts.push(`${field} le ${to}`);
    return parts;
}


function validateRequestBody(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return {query: {}, filters: {}, sort: []};

    const allowedTop = new Set(["query", "filters", "sort"]);
    const unknownTop = Object.keys(body).filter(k => !allowedTop.has(k));
    if (unknownTop.length) {
        const e = new Error("Unsupported advanced search fields.");
        e.status = 400;
        e.publicMessage = `Unsupported top-level fields: ${unknownTop.join(", ")}. Allowed: query, filters, sort.`;
        throw e;
    }

    const query = body.query && typeof body.query === "object" && !Array.isArray(body.query) ? body.query : {};
    const filters = body.filters && typeof body.filters === "object" && !Array.isArray(body.filters) ? body.filters : {};
    const sort = Array.isArray(body.sort) ? body.sort : [];

    const allowedQuery = new Set(["text"]);
    const unknownQuery = Object.keys(query).filter(k => !allowedQuery.has(k));
    if (unknownQuery.length) {
        const e = new Error("Unsupported query fields.");
        e.status = 400;
        e.publicMessage = `Unsupported query fields: ${unknownQuery.join(", ")}. Allowed: text.`;
        throw e;
    }

    const allowedFilters = new Set([
        "id",
        "friendlyId",
        "alternateIds",
        "keywords",
        "isStackable",
        "platforms",
        "tags",
        "tagsAny",
        "tagsAll",
        "contentKinds",
        "ratingMin",
        "creationDate",
        "lastModifiedDate",
        "startDate",
        "priceAmounts",
        "creatorName",
        "offerId",
        "purchasable",
        "packIdentityType"
    ]);
    const unknownFilters = Object.keys(filters).filter(k => !allowedFilters.has(k));
    if (unknownFilters.length) {
        const e = new Error("Unsupported filter fields.");
        e.status = 400;
        e.publicMessage = `Unsupported filter fields: ${unknownFilters.join(", ")}.`;
        throw e;
    }

    return {query, filters, sort};
}


function buildContainsAnyFilter(field, values, prefix = "x") {
    const list = normalizeArray(values);
    if (!list.length) return "";
    return orJoin(list.map(v => `${field}/any(${prefix}:${prefix} eq ${quoteString(v)})`));
}

function buildContainsAllFilter(field, values, prefix = "x") {
    const list = normalizeArray(values);
    if (!list.length) return "";
    return andJoin(list.map(v => `${field}/any(${prefix}:${prefix} eq ${quoteString(v)})`));
}

function normalizeKindName(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildContentKindFilter(values) {
    const rawKinds = normalizeArray(values);
    if (!rawKinds.length) return "";

    const unknown = [];
    const clauses = [];

    for (const value of rawKinds) {
        const normalized = normalizeKindName(value);
        const kind = CONTENT_KIND_ALIASES[normalized];
        if (!kind) {
            unknown.push(value);
            continue;
        }
        const def = CONTENT_KIND_DEFS[kind];
        if (!def) continue;
        const parts = [];
        if (def.contentTypes?.length) parts.push(orJoin(def.contentTypes.map(ct => `ContentType eq ${quoteString(ct)}`)));
        if (def.tagsAll?.length) parts.push(buildContainsAllFilter("tags", def.tagsAll, "t"));
        clauses.push(andJoin(parts));
    }

    if (unknown.length) {
        const e = new Error("Unknown contentKinds.");
        e.status = 400;
        e.publicMessage = `Unknown contentKinds: ${unknown.join(", ")}. Supported values: skinpack, world, persona, addon.`;
        throw e;
    }

    return orJoin(clauses.filter(Boolean));
}

function buildSearchText(query) {
    const text = typeof query?.text === "string" ? query.text.trim() : "";
    return text.slice(0, 200);
}

function buildPlayFabFilter(filters) {
    const clauses = [];

    const ids = normalizeArray(filters.id);
    if (ids.length) clauses.push(orJoin(ids.map(v => `Id eq ${quoteString(v)}`)));

    const friendlyIds = normalizeArray(filters.friendlyId);
    if (friendlyIds.length) {
        clauses.push(orJoin(friendlyIds.map(v => `alternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq ${quoteString(v)})`)));
    }

    const alternateIds = Array.isArray(filters.alternateIds) ? filters.alternateIds : [];
    const altClauses = [];
    for (const entry of alternateIds) {
        const type = typeof entry?.type === "string" ? entry.type.trim() : "";
        const value = typeof entry?.value === "string" ? entry.value.trim() : "";
        if (!type || !value) continue;
        altClauses.push(`alternateIds/any(a:a/Type eq ${quoteString(type)} and a/Value eq ${quoteString(value)})`);
    }
    if (altClauses.length) clauses.push(orJoin(altClauses));

    const stackable = normalizeBoolean(filters.isStackable);
    if (stackable !== null) clauses.push(`IsStackable eq ${stackable ? "true" : "false"}`);

    const platforms = normalizeArray(filters.platforms);
    if (platforms.length) clauses.push(orJoin(platforms.map(v => `platforms/any(p:p eq ${quoteString(v)})`)));

    const tags = normalizeArray(filters.tags);
    if (tags.length) clauses.push(buildContainsAnyFilter("tags", tags, "t"));

    const tagsAny = normalizeArray(filters.tagsAny);
    if (tagsAny.length) clauses.push(buildContainsAnyFilter("tags", tagsAny, "ta"));

    const tagsAll = normalizeArray(filters.tagsAll);
    if (tagsAll.length) clauses.push(buildContainsAllFilter("tags", tagsAll, "tb"));

    const contentKindClause = buildContentKindFilter(filters.contentKinds);
    if (contentKindClause) clauses.push(contentKindClause);

    clauses.push(...parseDateRange("CreationDate", filters.creationDate));
    clauses.push(...parseDateRange("LastModifiedDate", filters.lastModifiedDate));
    clauses.push(...parseDateRange("StartDate", filters.startDate));

    const priceMin = toFiniteNumber(filters?.priceAmounts?.min);
    const priceMax = toFiniteNumber(filters?.priceAmounts?.max);
    if (priceMin !== null) clauses.push(`DisplayProperties/price ge ${Math.max(0, priceMin)}`);
    if (priceMax !== null) clauses.push(`DisplayProperties/price le ${Math.max(0, priceMax)}`);

    const ratingMin = toFiniteNumber(filters.ratingMin);
    if (ratingMin !== null) clauses.push(`rating/average ge ${Math.max(0, ratingMin)}`);


    return andJoin(clauses);
}

function extractKeywordValues(item) {
    const out = [];
    const keywords = item?.Keywords;
    if (!keywords || typeof keywords !== "object") return out;
    for (const val of Object.values(keywords)) {
        const values = Array.isArray(val?.Values) ? val.Values : [];
        for (const entry of values) {
            if (typeof entry === "string" && entry.trim()) out.push(entry.trim().toLowerCase());
        }
    }
    return out;
}

function extractPriceAmounts(item, currencyId) {
    const amountValues = [];
    const priceNodes = [];
    if (Array.isArray(item?.Price?.Prices)) priceNodes.push(...item.Price.Prices);
    if (Array.isArray(item?.PriceOptions?.Prices)) priceNodes.push(...item.PriceOptions.Prices);

    for (const node of priceNodes) {
        const amounts = Array.isArray(node?.Amounts) ? node.Amounts : [];
        for (const amountEntry of amounts) {
            const cid = amountEntry?.CurrencyId || amountEntry?.Id || amountEntry?.ItemId;
            const amount = toFiniteNumber(amountEntry?.Amount);
            if (amount === null) continue;
            if (currencyId && cid !== currencyId) continue;
            amountValues.push(amount);
        }
    }

    if (!amountValues.length) {
        const fallback = toFiniteNumber(item?.DisplayProperties?.price);
        if (fallback !== null) amountValues.push(fallback);
    }

    return amountValues;
}

function applyApiLayerFilters(items, filters) {
    if (!items.length) return items;

    const friendlyIds = new Set(normalizeArray(filters.friendlyId).map(v => v.toLowerCase()));
    const keywordSet = new Set(normalizeArray(filters.keywords).map(v => v.toLowerCase()));
    const offerId = typeof filters.offerId === "string" ? filters.offerId.trim().toLowerCase() : "";
    const packIdentityType = typeof filters.packIdentityType === "string" ? filters.packIdentityType.trim().toLowerCase() : "";
    const creatorName = typeof filters.creatorName === "string" ? filters.creatorName.trim().toLowerCase() : "";
    const priceMin = toFiniteNumber(filters?.priceAmounts?.min);
    const priceMax = toFiniteNumber(filters?.priceAmounts?.max);
    const currencyId = typeof filters?.priceAmounts?.currencyId === "string" ? filters.priceAmounts.currencyId.trim() : "";
    const purchasable = normalizeBoolean(filters.purchasable);

    return items.filter(item => {
        if (friendlyIds.size) {
            const fid = String(item?.FriendlyId || "").toLowerCase();
            if (!friendlyIds.has(fid)) return false;
        }

        if (keywordSet.size) {
            const values = extractKeywordValues(item);
            if (!values.some(v => keywordSet.has(v))) return false;
        }

        if (offerId) {
            const itemOfferId = String(item?.DisplayProperties?.offerId || "").toLowerCase();
            if (itemOfferId !== offerId) return false;
        }

        if (packIdentityType) {
            const identities = Array.isArray(item?.DisplayProperties?.packIdentity) ? item.DisplayProperties.packIdentity : [];
            const found = identities.some(entry => String(entry?.type || "").toLowerCase() === packIdentityType);
            if (!found) return false;
        }

        if (creatorName) {
            const itemCreator = String(item?.DisplayProperties?.creatorName || "").trim().toLowerCase();
            if (itemCreator !== creatorName) return false;
        }

        if (purchasable !== null) {
            const itemPurchasable = normalizeBoolean(item?.DisplayProperties?.purchasable);
            if (itemPurchasable !== purchasable) return false;
        }

        if (priceMin !== null || priceMax !== null) {
            const amounts = extractPriceAmounts(item, currencyId || null);
            if (!amounts.length) return false;
            const inRange = amounts.some(v => (priceMin === null || v >= priceMin) && (priceMax === null || v <= priceMax));
            if (!inRange) return false;
        }

        return true;
    });
}

function parseSort(sort) {
    const playFabFields = {
        id: "Id",
        type: "Type",
        creationdate: "CreationDate",
        lastmodifieddate: "LastModifiedDate",
        startdate: "StartDate",
        isstackable: "IsStackable",
        priceamount: "DisplayProperties/price"
    };

    const localFieldExtractors = {
        id: it => String(it?.Id || ""),
        type: it => String(it?.Type || ""),
        title: it => String(it?.Title?.NEUTRAL || ""),
        description: it => String(it?.Description?.NEUTRAL || ""),
        keywords: it => extractKeywordValues(it).sort()[0] || "",
        isstackable: it => (it?.IsStackable ? 1 : 0),
        platforms: it => (Array.isArray(it?.Platforms) ? it.Platforms.length : 0),
        tags: it => (Array.isArray(it?.Tags) ? it.Tags.length : 0),
        creationdate: it => Date.parse(it?.CreationDate || 0) || 0,
        lastmodifieddate: it => Date.parse(it?.LastModifiedDate || 0) || 0,
        startdate: it => Date.parse(it?.StartDate || 0) || 0,
        priceamount: it => {
            const amounts = extractPriceAmounts(it, null);
            if (!amounts.length) return Number.POSITIVE_INFINITY;
            return Math.min(...amounts);
        },
        creatorname: it => String(it?.DisplayProperties?.creatorName || ""),
        purchasable: it => (it?.DisplayProperties?.purchasable ? 1 : 0),
        packidentitytype: it => {
            const identities = Array.isArray(it?.DisplayProperties?.packIdentity) ? it.DisplayProperties.packIdentity : [];
            return String(identities[0]?.type || "");
        }
    };

    if (!Array.isArray(sort) || !sort.length) return {orderBy: "CreationDate desc", localSort: []};

    const blocked = new Set(["offerid", "friendlyid", "alternateids"]);
    const localSort = [];
    const orderByParts = [];

    for (const entry of sort) {
        const fieldKey = String(entry?.field || "").trim().toLowerCase();
        if (!fieldKey || blocked.has(fieldKey)) {
            if (fieldKey && blocked.has(fieldKey)) {
                const e = new Error("Unsupported sort field.");
                e.status = 400;
                e.publicMessage = `Sorting by ${fieldKey} is not supported.`;
                throw e;
            }
            continue;
        }

        const dir = String(entry?.dir || "desc").toLowerCase() === "asc" ? "asc" : "desc";
        const pfField = playFabFields[fieldKey];
        if (pfField) orderByParts.push(`${pfField} ${dir}`);

        const extractor = localFieldExtractors[fieldKey];
        if (extractor) localSort.push({extractor, dir});
    }

    return {
        orderBy: orderByParts.length ? orderByParts.join(", ") : "CreationDate desc",
        localSort
    };
}

function applyLocalSort(items, localSort) {
    if (!Array.isArray(localSort) || !localSort.length) return items;
    const decorated = items.map(item => ({
        item,
        keys: localSort.map(rule => rule.extractor(item))
    }));

    decorated.sort((a, b) => {
        for (let i = 0; i < localSort.length; i += 1) {
            const rule = localSort[i];
            const av = a.keys[i];
            const bv = b.keys[i];
            if (av === bv) continue;
            if (av > bv) return rule.dir === "asc" ? 1 : -1;
            return rule.dir === "asc" ? -1 : 1;
        }
        return 0;
    });

    return decorated.map(entry => entry.item);
}

async function searchLoop(titleId, filter, search, orderBy, maxBatches = MAX_BATCHES) {
    const out = [];
    for (let i = 0, skip = 0; i < maxBatches; i += 1, skip += PAGE_BATCH) {
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


function hasLocalOnlyFilters(filters = {}) {
    return Boolean(
        normalizeArray(filters.keywords).length
        || (typeof filters.offerId === "string" && filters.offerId.trim())
        || (typeof filters.packIdentityType === "string" && filters.packIdentityType.trim())
        || (typeof filters.creatorName === "string" && filters.creatorName.trim())
        || normalizeBoolean(filters.purchasable) !== null
        || (typeof filters?.priceAmounts?.currencyId === "string" && filters.priceAmounts.currencyId.trim())
    );
}

exports.advancedSearch = async (alias, body, {page, pageSize}) => {
    const titleId = resolveTitle(alias);
    const normalized = validateRequestBody(body || {});
    const filter = buildPlayFabFilter(normalized.filters);
    const q = buildSearchText(normalized.query);
    const {orderBy, localSort} = parseSort(normalized.sort);

    let allFromPlayFab = await searchLoop(titleId, filter, q, orderBy);
    let filtered = applyApiLayerFilters(allFromPlayFab, normalized.filters);

    if (!filtered.length && hasLocalOnlyFilters(normalized.filters) && MAX_BATCHES < 400) {
        allFromPlayFab = await searchLoop(titleId, filter, q, orderBy, Math.min(400, MAX_BATCHES * 4));
        filtered = applyApiLayerFilters(allFromPlayFab, normalized.filters);
    }

    const sorted = applyLocalSort(filtered, localSort);

    const facets = buildFacets(sorted);
    const {items, meta} = paginate(sorted, page, pageSize);
    return {items, meta, facets};
};

exports._internals = {
    buildPlayFabFilter,
    parseSort,
    buildSearchText,
    applyApiLayerFilters,
    validateRequestBody,
    hasLocalOnlyFilters
};
