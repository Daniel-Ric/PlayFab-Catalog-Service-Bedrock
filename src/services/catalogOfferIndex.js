"use strict";

const crypto = require("node:crypto");
const nameKey = name => String(name || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const value = (item, upper, lower) => item?.[upper] ?? item?.[lower];
const titleOf = item => String(item.Title?.NEUTRAL || item.Title?.neutral || item.Title?.['en-US'] || Object.values(item.Title || {})[0] || '');
const registryMaps = new WeakMap();
function registryMap(registry) {
    if (!registryMaps.has(registry)) {
        const map = new Map();
        for (const row of registry) for (const alias of [row.displayName, row.creatorName, ...(row.aliases || [])]) {
            if (alias) map.set(nameKey(alias), row);
        }
        registryMaps.set(registry, map);
    }
    return registryMaps.get(registry);
}

function projectOffer(raw, registry = []) {
    const dp = value(raw, "DisplayProperties", "displayProperties") || {};
    const type = String(value(raw, "ContentType", "contentType") || "");
    const tags = (value(raw, "Tags", "tags") || []).map(String);
    const creatorName = String(dp.creatorName || "");
    const registered = registryMap(registry).get(nameKey(creatorName));
    const entity = raw.CreatorEntityKey || raw.creatorEntityKey;
    const sourceId = raw.CreatorId || raw.creatorId || (entity?.Id && entity?.Type ? `${entity.Type}!${entity.Id}` : entity?.Id);
    const creatorId = sourceId || registered?.id || `name:${nameKey(creatorName) || "unknown"}`;
    const scope = type.startsWith("shell_") ? "raw" : type === "MarketplaceDurableCatalog_V1.2" ? "marketplace"
        : type === "PersonaDurable" ? "persona" : type.startsWith("3PServerContent") ? "server" : "raw";
    const category = scope === "persona" ? "persona" : scope === "server" ? "server" : scope === "marketplace"
        ? ["addon", "mashup", "worldtemplate", "resourcepack", "skinpack"].find(tag => tags.includes(tag)) || "other" : "raw";
    const images = value(raw, "Images", "images") || [];
    const image = images.find(row => /thumbnail|thumbnail_0/i.test(row.Tag || row.tag || "")) || images[0];
    return {
        Id: String(value(raw, "Id", "id")), Title: value(raw, "Title", "title") || {},
        ContentType: type, Type: value(raw, "Type", "type") || '', Tags: tags, Images: image ? [image] : [], Platforms: value(raw, "Platforms", "platforms") || [],
        CreationDate: value(raw, "CreationDate", "creationDate") || null,
        StartDate: value(raw, "StartDate", "startDate") || null,
        LastModifiedDate: value(raw, "LastModifiedDate", "lastModifiedDate") || null,
        Rating: value(raw, "Rating", "rating") || {}, PriceOptions: value(raw, "PriceOptions", "priceOptions") || null,
        DisplayProperties: Object.fromEntries(["creatorName", "offerId", "purchasable", "price", "originalPrice",
            "packIdentity", "packIdentityType", "platforms", "skinCount", "pieceType", "videoUrl", "premium", "thumbnail",
            "lastUpdated", "minClientVersion", "maxClientVersion", "totalContentFileSize", "rarity"].filter(key => dp[key] !== undefined).map(key => [key, dp[key]])),
        creatorId, creatorAliases: [...new Set([creatorName, registered?.creatorName, registered?.displayName, ...(registered?.aliases || [])].filter(Boolean))],
        scope, category, availability: "observed", archived: false
    };
}

function price(item) {
    const amount = item.PriceOptions?.Prices?.[0]?.Amounts?.[0]?.Amount ?? item.DisplayProperties?.price;
    return amount == null ? null : Number(amount);
}

class CatalogOfferIndex {
    constructor(snapshot, {staleMs = 26 * 3600000, now = Date.now} = {}) {
        this.snapshot = snapshot;
        this.now = now;
        this.staleMs = staleMs;
        this.items = snapshot?.items || [];
        this.cache = new Map();
        this.creators = new Map();
        for (const item of this.items) {
            for (const alias of [item.DisplayProperties?.creatorName, ...(item.creatorAliases || [])]) {
                const key = nameKey(alias);
                if (!this.creators.has(key)) this.creators.set(key, new Set());
                this.creators.get(key).add(item.Id);
            }
        }
    }
    coverage() {
        return {status: !this.snapshot ? "partial" : this.now() - Date.parse(this.snapshot.updatedAt) > this.staleMs ? "stale" : "complete",
            reason: this.snapshot ? null : "initial_import_pending", snapshotId: this.snapshot?.id || null,
            updatedAt: this.snapshot?.updatedAt || null, asOf: this.snapshot?.horizon || null,
            totalIsExact: Boolean(this.snapshot)};
    }
    query(input = {}) {
        const limit = Number(input.limit ?? 24);
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw Object.assign(new Error("limit must be between 1 and 1000"), {status: 400});
        const query = {
            scope: String(input.scope || "marketplace"), category: String(input.category || ""),
            creator: nameKey(input.creator || ""), creatorId: String(input.creatorId || ""), q: String(input.q || "").trim().toLowerCase(),
            sort: String(input.sort || "latest"), dir: input.dir || (['title', 'price'].includes(input.sort) ? 'asc' : 'desc'), archived: String(input.archived || "false") === "true",
            free: String(input.free || "false") === "true", packType: String(input.packType || ""),
            tag: String(input.tag || ''), platform: String(input.platform || ''),
            contentTypes: String(input.contentTypes || ''), tagsAll: String(input.tagsAll || ''), limit
        };
        query.purchasable = input.purchasable === 'true' || input.purchasable === true ? true
            : input.purchasable === 'false' || input.purchasable === false ? false : null;
        for (const key of ['minPrice', 'maxPrice', 'minRating', 'maxRating', 'minRatingCount']) {
            query[key] = input[key] == null || input[key] === '' ? null : Number(input[key]);
            if (query[key] !== null && (!Number.isFinite(query[key]) || query[key] < 0)) throw Object.assign(new Error(`Invalid ${key}`), {status: 400});
        }
        for (const key of ['startDateFrom', 'startDateTo', 'creationDateFrom', 'creationDateTo', 'lastModifiedDateFrom', 'lastModifiedDateTo']) {
            const date = input[key] ? String(input[key]) : '';
            query[key] = date ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T${key.endsWith('To') ? '23:59:59.999' : '00:00:00.000'}Z` : date) : null;
            if (query[key] !== null && !Number.isFinite(query[key])) throw Object.assign(new Error(`Invalid ${key}`), {status: 400});
        }
        if (!["marketplace", "persona", "server", "raw", "all", "offers"].includes(query.scope)
            || !["latest", "popular", "title", "price", "trending", "created", "modified", "rating"].includes(query.sort)
            || query.q.length > 200 || query.creator.length > 200 || String(input.cursor || '').length > 8192) {
            throw Object.assign(new Error("Invalid catalog scope or sort"), {status: 400});
        }
        const key = JSON.stringify(query);
        const hash = crypto.createHash("sha256").update(key).digest("hex");
        let offset = 0;
        if (input.cursor) {
            let cursor;
            try { cursor = JSON.parse(Buffer.from(String(input.cursor), "base64url").toString()); } catch {                       }
            if (!cursor || cursor.query !== hash || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) {
                throw Object.assign(new Error("Cursor does not match query"), {status: 400});
            }
            if (cursor.snapshot !== this.snapshot?.id) throw Object.assign(new Error("Catalog snapshot changed; restart pagination"), {status: 409});
            offset = cursor.offset;
        }
        let matches = this.cache.get(key);
        if (!matches) {
            const creatorIds = query.creator ? this.creators.get(query.creator) || new Set() : null;
            matches = this.items.filter(item => item.archived === query.archived
                && (query.scope === "all" || item.scope === query.scope || (query.scope === 'offers' && ['marketplace', 'persona', 'server'].includes(item.scope)))
                && (!query.category || item.category === query.category)
                && (!query.contentTypes || query.contentTypes.split(',').includes(item.ContentType))
                && (!query.tagsAll || query.tagsAll.split(',').every(tag => item.Tags.includes(tag)))
                && (!creatorIds || creatorIds.has(item.Id))
                && (!query.creatorId || item.creatorId === query.creatorId)
                && (!query.free || price(item) === 0)
                && (query.purchasable === null || item.DisplayProperties?.purchasable === query.purchasable)
                && (!query.tag || item.Tags.includes(query.tag))
                && (!query.platform || item.Platforms.includes(query.platform))
                && (query.minPrice === null || (price(item) !== null && price(item) >= query.minPrice))
                && (query.maxPrice === null || (price(item) !== null && price(item) <= query.maxPrice))
                && (query.minRating === null || Number(item.Rating?.Average || 0) >= query.minRating)
                && (query.maxRating === null || Number(item.Rating?.Average || 0) <= query.maxRating)
                && (query.minRatingCount === null || Number(item.Rating?.TotalCount || 0) >= query.minRatingCount)
                && ['startDate', 'creationDate', 'lastModifiedDate'].every(field => {
                    if (query[`${field}From`] === null && query[`${field}To`] === null) return true;
                    const date = Date.parse(item[field[0].toUpperCase() + field.slice(1)] || (field === 'startDate' ? item.CreationDate : ''));
                    return (query[`${field}From`] === null || date >= query[`${field}From`]) && (query[`${field}To`] === null || date <= query[`${field}To`]);
                })
                && (!query.packType || (item.DisplayProperties?.packIdentity || []).some(pack => pack.type === query.packType))
                && (!query.q || `${Object.values(item.Title).join(" ")} ${item.creatorAliases.join(" ")} ${item.Tags.join(" ")}`.toLowerCase().includes(query.q)));
            const rank = item => query.sort === "popular" ? Number(item.Rating?.TotalCount || 0)
                : query.sort === 'rating' ? Number(item.Rating?.Average || 0)
                : query.sort === "trending" ? Number(item.ratingGrowth || 0)
                : Date.parse(query.sort === 'created' ? item.CreationDate : query.sort === 'modified' ? item.LastModifiedDate : item.StartDate || item.CreationDate) || 0;
            const direction = query.dir === 'asc' ? 1 : -1;
            matches.sort((a, b) => (query.sort === "title" ? direction * titleOf(a).localeCompare(titleOf(b), 'en')
                : query.sort === "price" ? (price(a) === null ? (price(b) === null ? 0 : 1) : price(b) === null ? -1 : direction * (price(a) - price(b)))
                    : direction * (rank(a) - rank(b))) || (a.Id < b.Id ? -1 : a.Id > b.Id ? 1 : 0));
            if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value);
            this.cache.set(key, matches);
        }
        const items = matches.slice(offset, offset + limit);
        const next = offset + items.length;
        return {items, meta: {total: this.snapshot ? matches.length : null, count: items.length, totalIsExact: Boolean(this.snapshot)},
            pagination: {hasNext: next < matches.length, nextCursor: next < matches.length
                ? Buffer.from(JSON.stringify({snapshot: this.snapshot.id, query: hash, offset: next})).toString("base64url") : null},
            coverage: {...this.coverage(), total: this.snapshot ? matches.length : null}};
    }
    stats() {
        const scopes = {}, categories = {};
        for (const item of this.items) {
            const scope = item.archived ? "archive" : item.scope;
            scopes[scope] = (scopes[scope] || 0) + 1;
            if (!item.archived) categories[item.category] = (categories[item.category] || 0) + 1;
        }
        return {scopes, categories, coverage: this.coverage()};
    }
    home(input = {}) {
        const blocks = {};
        for (const [name, query] of Object.entries({latest: {}, free: {free: true}, addons: {category: "addon"},
            skinpacks: {category: "skinpack"}, popular: {sort: "popular"}, trending: {sort: "trending"}})) {
            const counts = new Map();
            blocks[name] = this.query({...query, creator: input.creator || "", limit: 240}).items.filter(item => {
                if (name === 'trending' && (!(item.ratingGrowth > 0) || this.now() - (item.ratingGrowthUpdatedAt || 0) > 26 * 3600000)) return false;
                const creator = nameKey(item.DisplayProperties?.creatorName) || item.creatorId;
                if (!input.creator && (counts.get(creator) || 0) >= 3) return false;
                counts.set(creator, (counts.get(creator) || 0) + 1);
                return true;
            }).slice(0, 12);
        }
        return {blocks, coverage: this.coverage()};
    }
}
module.exports = {CatalogOfferIndex, projectOffer, nameKey, price};
