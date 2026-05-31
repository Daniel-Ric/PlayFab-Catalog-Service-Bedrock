// -----------------------------------------------------------------------------
//
// File: src/services/marketplaceSearchService.js
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
const {
    sendPlayFabRequest,
    transformItem
} = require("../utils/playfab");

const OS = process.env.OS || "iOS";
const MAX_SEARCH_COUNT = 50;
const MAX_LOCALIZED_LANGUAGES = 8;
const MAX_AUDIT_PAGES = 10;
const DEFAULT_SEARCH_SELECT = "";
const AUDIT_SELECT = "contents,images,title,description,keywords";
const LOCALIZED_SELECT = "title,description,keywords,images";

function err(status, message) {
    const e = new Error(message);
    e.status = status;
    e.publicMessage = message;
    return e;
}

function clampInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function trimString(value, max = 1000) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, max);
}

function normalizeArray(value, max = 100) {
    if (Array.isArray(value)) return value.map(v => trimString(String(v || ""), 120)).filter(Boolean).slice(0, max);
    if (typeof value === "string" && value.trim()) return [value.trim().slice(0, 120)];
    return [];
}

function normalizeKeywordValues(keywords, language) {
    const out = [];
    if (!keywords || typeof keywords !== "object") return out;
    const keys = [language, "NEUTRAL", "neutral"].filter(Boolean);
    for (const key of keys) {
        const node = keywords[key];
        const values = Array.isArray(node?.Values) ? node.Values : Array.isArray(node?.values) ? node.values : [];
        for (const value of values) {
            if (typeof value === "string" && value.trim()) out.push(value.trim());
        }
        if (out.length) return Array.from(new Set(out));
    }
    for (const node of Object.values(keywords)) {
        const values = Array.isArray(node?.Values) ? node.Values : Array.isArray(node?.values) ? node.values : [];
        for (const value of values) {
            if (typeof value === "string" && value.trim()) out.push(value.trim());
        }
    }
    return Array.from(new Set(out));
}

function localizedValue(map, language) {
    if (!map || typeof map !== "object") return "";
    const keys = [language, "NEUTRAL", "neutral", "en-US", "en-us", "en"].filter(Boolean);
    for (const key of keys) {
        const value = map[key];
        if (typeof value === "string" && value.trim()) return value;
    }
    for (const value of Object.values(map)) {
        if (typeof value === "string" && value.trim()) return value;
    }
    return "";
}

function normalizeImages(item) {
    const images = Array.isArray(item?.Images) ? item.Images : Array.isArray(item?.images) ? item.images : [];
    return images.map(img => ({
        id: img?.Id || img?.id || "",
        tag: img?.Tag || img?.tag || "",
        type: img?.Type || img?.type || "",
        url: img?.Url || img?.url || ""
    })).filter(img => img.url || img.id);
}

function thumbnailFrom(images) {
    const hit = images.find(img => String(img.type || img.tag || "").toLowerCase() === "thumbnail")
        || images.find(img => String(img.tag || "").toLowerCase() === "thumbnail")
        || images[0];
    return hit?.url || null;
}

function friendlyIdFrom(item) {
    const ids = Array.isArray(item?.AlternateIds) ? item.AlternateIds : [];
    const hit = ids.find(entry => String(entry?.Type || entry?.type || "").toLowerCase() === "friendlyid");
    return hit?.Value || hit?.value || null;
}

function normalizeAlternateIds(ids) {
    if (!Array.isArray(ids)) return [];
    return ids.map(entry => ({
        type: entry?.Type || entry?.type || "",
        value: entry?.Value || entry?.value || ""
    })).filter(entry => entry.type && entry.value);
}

function firstPrice(item) {
    const dp = item?.DisplayProperties || item?.displayProperties || {};
    if (typeof dp.price === "number") return {amount: dp.price, currencyId: "Minecoins"};
    const priceNodes = [];
    if (Array.isArray(item?.PriceOptions?.Prices)) priceNodes.push(...item.PriceOptions.Prices);
    if (Array.isArray(item?.Price?.Prices)) priceNodes.push(...item.Price.Prices);
    for (const price of priceNodes) {
        const amounts = Array.isArray(price?.Amounts) ? price.Amounts : [];
        for (const amount of amounts) {
            const value = Number(amount?.Amount);
            if (!Number.isFinite(value)) continue;
            return {
                amount: value,
                currencyId: amount?.CurrencyId || amount?.ItemId || amount?.Id || null
            };
        }
    }
    return null;
}

function normalizeRating(item) {
    const rating = item?.Rating || item?.rating || {};
    const average = Number(rating.Average ?? rating.average ?? rating.AverageRating ?? rating.averageRating);
    const totalCount = Number(rating.TotalCount ?? rating.totalCount ?? rating.TotalRatingsCount ?? rating.totalRatingsCount ?? rating.Count ?? rating.count);
    return {
        average: Number.isFinite(average) ? average : null,
        totalCount: Number.isFinite(totalCount) ? totalCount : 0
    };
}

function normalizeDeepLinks(item) {
    const links = Array.isArray(item?.DeepLinks) ? item.DeepLinks : Array.isArray(item?.deepLinks) ? item.deepLinks : [];
    return links.map(link => ({
        platform: link?.Platform || link?.platform || "",
        url: link?.Url || link?.url || ""
    })).filter(link => link.platform || link.url);
}

function normalizeSearchItem(item, language, includeRaw = false) {
    const images = normalizeImages(item);
    const id = item?.Id || item?.id || "";
    const out = {
        id,
        friendlyId: friendlyIdFrom(item),
        alternateIds: normalizeAlternateIds(item?.AlternateIds || item?.alternateIds),
        title: localizedValue(item?.Title || item?.title, language),
        description: localizedValue(item?.Description || item?.description, language),
        keywords: normalizeKeywordValues(item?.Keywords || item?.keywords, language),
        creatorId: item?.CreatorId || item?.creatorId || item?.CreatorEntityKey?.Id || null,
        creatorName: item?.DisplayProperties?.creatorName || item?.displayProperties?.creatorName || "",
        thumbnail: thumbnailFrom(images),
        images,
        price: firstPrice(item),
        rating: normalizeRating(item),
        contentType: item?.ContentType || item?.contentType || "",
        tags: Array.isArray(item?.Tags) ? item.Tags : Array.isArray(item?.tags) ? item.tags : [],
        platforms: Array.isArray(item?.Platforms) ? item.Platforms : Array.isArray(item?.platforms) ? item.platforms : [],
        deepLinks: normalizeDeepLinks(item),
        creationDate: item?.CreationDate || item?.creationDate || null,
        startDate: item?.StartDate || item?.startDate || item?.CreationDate || item?.creationDate || null,
        lastModifiedDate: item?.LastModifiedDate || item?.lastModifiedDate || null,
        clientUrl: id ? `https://open.view-marketplace.net/StoreOffer/${id}` : null
    };
    if (includeRaw) out.rawItem = item;
    return out;
}

function normalizeAlternateId(entry) {
    if (!entry || typeof entry !== "object") return null;
    const type = trimString(entry.Type || entry.type, 80);
    const value = trimString(entry.Value || entry.value, 200);
    if (!type || !value) return null;
    return {Type: type, Value: value};
}

function normalizeStore(input = {}) {
    const store = input.Store || input.store || null;
    if (store && typeof store === "object" && !Array.isArray(store)) {
        const id = trimString(store.Id || store.id, 200);
        if (id) return {Id: id};
        const alternate = normalizeAlternateId(store.AlternateId || store.alternateId);
        if (alternate) return {AlternateId: alternate};
    }

    const storeId = trimString(input.StoreId || input.storeId, 200);
    if (storeId) return {Id: storeId};

    const rawAlternate = input.StoreAlternateId || input.storeAlternateId;
    if (rawAlternate && typeof rawAlternate === "object") {
        const alternate = normalizeAlternateId(rawAlternate);
        if (alternate) return {AlternateId: alternate};
    }
    const alternateValue = trimString(rawAlternate, 200);
    if (alternateValue) {
        return {
            AlternateId: {
                Type: trimString(input.StoreAlternateIdType || input.storeAlternateIdType || "FriendlyId", 80),
                Value: alternateValue
            }
        };
    }
    return null;
}

function buildSearchItemsPayload(input = {}, defaults = {}) {
    const query = input.query && typeof input.query === "object" && !Array.isArray(input.query) ? input.query : {};
    const payload = {};
    const search = trimString(input.Search || input.search || query.text || defaults.search || "", 200);
    const filter = trimString(input.Filter || input.filter || defaults.filter || "", 2000);
    const orderBy = trimString(input.OrderBy || input.orderBy || defaults.orderBy || "", 500);
    const select = trimString(input.Select || input.select || defaults.select || DEFAULT_SEARCH_SELECT, 500);
    const language = trimString(input.Language || input.language || defaults.language || "", 40);
    const continuationToken = trimString(input.ContinuationToken || input.continuationToken || defaults.continuationToken || "", 3000);
    const count = clampInt(input.Count ?? input.count ?? defaults.count, defaults.count || 24, 1, MAX_SEARCH_COUNT);
    const store = normalizeStore(input) || normalizeStore(defaults);

    payload.Search = search;
    payload.Count = count;
    if (filter) payload.Filter = filter;
    if (orderBy) payload.OrderBy = orderBy;
    if (select) payload.Select = select;
    if (language) payload.Language = language;
    if (continuationToken) payload.ContinuationToken = continuationToken;
    if (store) payload.Store = store;
    return payload;
}

function searchMeta(alias, payload, source) {
    return {
        alias,
        source,
        search: payload.Search || "",
        filter: payload.Filter || "",
        orderBy: payload.OrderBy || "",
        select: payload.Select || "",
        language: payload.Language || null,
        store: payload.Store || null
    };
}

async function runSearchItems(titleId, payload) {
    const data = await sendPlayFabRequest(titleId, "Catalog/SearchItems", payload, "X-EntityToken", 3, OS);
    return {
        rawItems: data?.Items || data?.items || [],
        continuationToken: data?.ContinuationToken || data?.continuationToken || null
    };
}

async function searchItems(alias, body = {}, defaults = {}) {
    const titleId = resolveTitle(alias);
    const payload = buildSearchItemsPayload(body, defaults);
    const data = await runSearchItems(titleId, payload);
    const items = data.rawItems.map(item => normalizeSearchItem(item, payload.Language, body.includeRaw === true));
    return {
        items,
        pagination: {
            count: items.length,
            requestedCount: payload.Count,
            continuationToken: data.continuationToken,
            hasNext: Boolean(data.continuationToken)
        },
        meta: searchMeta(alias, payload, "playfab.catalog.searchItems")
    };
}

async function searchStore(alias, body = {}) {
    const store = normalizeStore(body);
    if (!store) throw err(400, "storeId, storeAlternateId, or store is required.");
    return searchItems(alias, {...body, store}, {count: 24});
}

function normalizeResolveAlternateIds(entries) {
    const input = Array.isArray(entries) ? entries : [];
    return input.map(normalizeAlternateId).filter(Boolean);
}

async function resolveBatch(alias, body = {}) {
    const titleId = resolveTitle(alias);
    const ids = Array.from(new Set([
        ...normalizeArray(body.ids, 50),
        ...normalizeArray(body.itemIds, 50)
    ])).slice(0, 50);
    const alternateIds = normalizeResolveAlternateIds(body.alternateIds);
    const totalRefs = ids.length + alternateIds.length;
    if (!totalRefs) throw err(400, "At least one id or alternateId is required.");
    if (totalRefs > 50) throw err(400, "GetItems supports up to 50 ids or alternateIds per request.");

    const payload = {};
    if (ids.length) payload.Ids = ids;
    if (alternateIds.length) payload.AlternateIds = alternateIds;
    const data = await sendPlayFabRequest(titleId, "Catalog/GetItems", payload, "X-EntityToken", 3, OS);
    const rawItems = data?.Items || data?.items || [];
    const items = rawItems.map(transformItem);
    return {
        items,
        meta: {
            alias,
            source: "playfab.catalog.getItems",
            requestedIds: ids,
            requestedAlternateIds: alternateIds,
            count: items.length
        }
    };
}

function addSuggestion(map, value, type, extra = {}) {
    const clean = trimString(value, 160);
    if (!clean) return;
    const key = `${type}:${clean.toLowerCase()}`;
    if (!map.has(key)) map.set(key, {type, value: clean, ...extra});
}

async function suggest(alias, query = {}) {
    const q = trimString(query.q || query.search || "", 100);
    if (!q) throw err(400, "q is required.");
    const count = clampInt(query.count, 8, 1, 20);
    const language = trimString(query.language || "", 40);
    const filter = trimString(query.filter || "", 1000);
    const response = await searchItems(alias, {
        search: q,
        filter,
        language,
        select: "title,keywords,images",
        count: Math.min(MAX_SEARCH_COUNT, Math.max(count * 2, count))
    });

    const suggestions = new Map();
    for (const item of response.items) {
        addSuggestion(suggestions, item.title, "item", {
            itemId: item.id,
            friendlyId: item.friendlyId,
            thumbnail: item.thumbnail
        });
        addSuggestion(suggestions, item.creatorName, "creator", {itemId: item.id});
        for (const keyword of item.keywords || []) {
            if (keyword.toLowerCase().includes(q.toLowerCase())) addSuggestion(suggestions, keyword, "keyword", {itemId: item.id});
        }
    }

    return {
        suggestions: Array.from(suggestions.values()).slice(0, count),
        meta: {
            alias,
            query: q,
            language: language || null,
            count
        }
    };
}

async function localizedSearch(alias, body = {}) {
    const languages = normalizeArray(body.languages, MAX_LOCALIZED_LANGUAGES);
    const selected = languages.length ? languages : ["en-US", "de-DE"];
    const results = {};
    await Promise.all(selected.map(async language => {
        const data = await searchItems(alias, {
            ...body,
            language,
            select: body.select || LOCALIZED_SELECT,
            count: body.count || 24,
            includeRaw: body.includeRaw === true
        });
        results[language] = {
            items: data.items,
            pagination: data.pagination
        };
    }));
    return {
        languages: results,
        meta: {
            alias,
            languages: selected,
            search: trimString(body.search || body.Search || body?.query?.text || "", 200),
            filter: trimString(body.filter || body.Filter || "", 2000),
            orderBy: trimString(body.orderBy || body.OrderBy || "", 500),
            select: body.select || LOCALIZED_SELECT
        }
    };
}

function validUrl(value) {
    if (!value || typeof value !== "string") return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

function parseVersion(value) {
    if (!value || typeof value !== "string") return null;
    const parts = value.split(".").map(part => Number(part));
    if (!parts.length || parts.some(part => !Number.isInteger(part) || part < 0 || part > 65535)) return null;
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
}

function compareVersion(a, b) {
    const va = parseVersion(a);
    const vb = parseVersion(b);
    if (!va || !vb) return 0;
    for (let i = 0; i < 3; i += 1) {
        if (va[i] !== vb[i]) return va[i] - vb[i];
    }
    return 0;
}

function hasLocalizedValue(map, language) {
    if (!language) return true;
    return Boolean(map && typeof map === "object" && typeof map[language] === "string" && map[language].trim());
}

function auditOne(item, languages = []) {
    const images = normalizeImages(item);
    const contents = Array.isArray(item?.Contents) ? item.Contents : Array.isArray(item?.contents) ? item.contents : [];
    const deepLinks = normalizeDeepLinks(item);
    const platforms = Array.isArray(item?.Platforms) ? item.Platforms : [];
    const issues = [];

    if (!images.length) issues.push("missingImages");
    if (!images.some(img => String(img.type || img.tag || "").toLowerCase() === "thumbnail")) issues.push("missingThumbnail");
    if (!images.some(img => String(img.type || img.tag || "").toLowerCase() === "screenshot")) issues.push("missingScreenshots");
    if (images.some(img => img.url && !validUrl(img.url))) issues.push("invalidImageUrl");
    if (!contents.length) issues.push("missingContents");
    if (contents.some(content => content?.Url && !validUrl(content.Url))) issues.push("invalidContentUrl");
    if (contents.some(content => !content?.MinClientVersion && !content?.minClientVersion)) issues.push("missingMinClientVersion");
    if (contents.some(content => !content?.MaxClientVersion && !content?.maxClientVersion)) issues.push("missingMaxClientVersion");
    if (contents.some(content => compareVersion(content?.MinClientVersion || content?.minClientVersion, content?.MaxClientVersion || content?.maxClientVersion) > 0)) issues.push("invalidClientVersionRange");
    if (!platforms.length) issues.push("missingPlatforms");
    if (!deepLinks.length) issues.push("missingDeepLinks");

    for (const language of languages) {
        if (!hasLocalizedValue(item?.Title || item?.title, language)) issues.push(`missingTitle:${language}`);
        if (!hasLocalizedValue(item?.Description || item?.description, language)) issues.push(`missingDescription:${language}`);
    }

    return {
        item: normalizeSearchItem(item, languages[0] || "", false),
        issues
    };
}

async function audit(alias, body = {}) {
    const titleId = resolveTitle(alias);
    const count = clampInt(body.count, MAX_SEARCH_COUNT, 1, MAX_SEARCH_COUNT);
    const maxPages = clampInt(body.maxPages, 1, 1, MAX_AUDIT_PAGES);
    const languages = normalizeArray(body.languages, MAX_LOCALIZED_LANGUAGES);
    const all = [];
    let continuationToken = trimString(body.continuationToken || "", 3000);
    let pages = 0;

    while (pages < maxPages) {
        const payload = buildSearchItemsPayload({
            ...body,
            count,
            continuationToken,
            select: body.select || AUDIT_SELECT
        });
        const data = await runSearchItems(titleId, payload);
        all.push(...data.rawItems);
        pages += 1;
        continuationToken = data.continuationToken || "";
        if (!continuationToken) break;
    }

    const issueCounts = {};
    const problematic = [];
    for (const raw of all) {
        const result = auditOne(raw, languages);
        if (!result.issues.length) continue;
        for (const issue of result.issues) issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        problematic.push(result);
    }

    return {
        items: problematic,
        summary: {
            scanned: all.length,
            healthy: all.length - problematic.length,
            unhealthy: problematic.length,
            issueCounts
        },
        pagination: {
            scannedPages: pages,
            continuationToken: continuationToken || null,
            hasNext: Boolean(continuationToken)
        },
        meta: {
            alias,
            source: "playfab.catalog.searchItems.audit",
            languages,
            maxPages,
            count
        }
    };
}

module.exports = {
    searchItems,
    searchStore,
    resolveBatch,
    suggest,
    localizedSearch,
    audit,
    _internals: {
        buildSearchItemsPayload,
        normalizeStore,
        normalizeSearchItem,
        normalizeAlternateId,
        auditOne,
        clampInt
    }
};
