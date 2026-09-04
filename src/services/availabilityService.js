// -----------------------------------------------------------------------------
//
// File: src/services/availabilityService.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
//
// -----------------------------------------------------------------------------

const {dataCache} = require("../config/cache");
const {resolveTitle} = require("../utils/titles");
const {getItemsByIds, getStoreItems, sendPlayFabRequest} = require("../utils/playfab");
const {SUBSCRIPTION_DEFS, getItemSubscriptionInfo} = require("../utils/marketplaceSubscriptions");

const OS = process.env.OS || "iOS";
const STORE_INDEX_TTL_MS = Math.max(1000, Number(process.env.AVAILABILITY_STORE_INDEX_TTL_MS || 60 * 1000));
const STORE_CONCURRENCY = Math.max(1, Number(process.env.AVAILABILITY_STORE_CONCURRENCY || 5));

function pickLocale(value) {
    if (!value || typeof value !== "object") return null;
    return value["en-US"] || value["en-GB"] || value.NEUTRAL || value.neutral || Object.values(value)[0] || null;
}

function normalizeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeVersion(value) {
    if (Array.isArray(value)) return value.map(part => String(part).trim()).filter(Boolean).join(".");
    return value == null ? null : String(value).trim() || null;
}

function readPriceAmounts(price) {
    const prices = Array.isArray(price?.Prices) ? price.Prices : [];
    return prices.flatMap(entry => (entry?.Amounts || []).map(amount => ({
        currencyId: amount?.CurrencyId || amount?.ItemId || amount?.Id || null,
        amount: Number.isFinite(Number(amount?.Amount)) ? Number(amount.Amount) : null
    }))).filter(amount => amount.currencyId && amount.amount !== null);
}

function itemPrices(item) {
    const prices = [
        ...readPriceAmounts(item?.PriceOptions),
        ...readPriceAmounts(item?.Price)
    ];
    const displayPrice = item?.DisplayProperties?.price;
    if (Number.isFinite(Number(displayPrice))) {
        prices.unshift({currencyId: "Minecoins", amount: Number(displayPrice)});
    }
    const seen = new Set();
    return prices.filter(price => {
        const key = `${price.currencyId}:${price.amount}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function storeItemId(entry) {
    return entry?.Item?.Id || entry?.Item?.id || entry?.ItemId || entry?.itemId || entry?.Id || entry?.id || null;
}

function storeReferences(store, items) {
    if (Array.isArray(store?.ItemReferences) && store.ItemReferences.length) {
        return store.ItemReferences.map(reference => ({
            itemId: reference?.Id || reference?.id || null,
            prices: readPriceAmounts(reference?.Price)
        })).filter(reference => reference.itemId);
    }
    return (items || []).map(entry => ({
        itemId: storeItemId(entry),
        prices: readPriceAmounts(entry?.Price)
    })).filter(reference => reference.itemId);
}

function isActiveWindow(startDate, endDate, now = Date.now()) {
    const start = startDate ? Date.parse(startDate) : null;
    const end = endDate ? Date.parse(endDate) : null;
    if (Number.isFinite(start) && now < start) return false;
    if (Number.isFinite(end) && now >= end) return false;
    return true;
}

function projectStore(store, prices, now = Date.now()) {
    const display = store?.DisplayProperties || {};
    const startDate = normalizeDate(display.startDate || store?.StartDate);
    const endDate = normalizeDate(display.endDate || store?.EndDate);
    return {
        id: store?.Id || store?.id || null,
        title: pickLocale(store?.Title) || store?.Name || null,
        startDate,
        endDate,
        active: isActiveWindow(startDate, endDate, now),
        discountPercent: typeof display.discount === "number" ? Math.round(display.discount * 100) : null,
        prices,
        tags: Array.isArray(store?.Tags) ? store.Tags : [],
        platforms: Array.isArray(store?.Platforms) ? store.Platforms : []
    };
}

function contentVariants(item) {
    return (Array.isArray(item?.Contents) ? item.Contents : []).map(content => ({
        id: content?.Id || content?.id || null,
        type: content?.Type || content?.type || null,
        minClientVersion: normalizeVersion(content?.MinClientVersion || content?.minClientVersion),
        maxClientVersion: normalizeVersion(content?.MaxClientVersion || content?.maxClientVersion),
        tags: Array.isArray(content?.Tags) ? content.Tags : []
    })).filter(content => content.id || content.type);
}

function itemLanguages(item) {
    const languages = new Set();
    for (const field of [item?.Title, item?.Description, item?.Keywords]) {
        if (!field || typeof field !== "object") continue;
        for (const language of Object.keys(field)) languages.add(language);
    }
    return Array.from(languages).sort((a, b) => a.localeCompare(b));
}

function launchLinks(item) {
    const links = Array.isArray(item?.DeepLinks) ? item.DeepLinks : [];
    return links.map(link => ({
        platform: link?.Platform || link?.platform || null,
        url: link?.Url || link?.url || null
    })).filter(link => link.url);
}

function buildAvailability(item, stores = [], now = Date.now()) {
    const display = item?.DisplayProperties || {};
    const prices = itemPrices(item);
    const allPrices = [...prices, ...stores.flatMap(store => Array.isArray(store?.prices) ? store.prices : [])];
    const startDate = normalizeDate(item?.StartDate || item?.CreationDate);
    const endDate = normalizeDate(item?.EndDate || display.endDate);
    const subscriptions = Object.keys(SUBSCRIPTION_DEFS).map(key => getItemSubscriptionInfo(item, key));
    return {
        itemId: item?.Id || item?.id || null,
        title: pickLocale(item?.Title),
        available: isActiveWindow(startDate, endDate, now),
        isFree: allPrices.some(price => price.amount === 0),
        startDate,
        endDate,
        platforms: Array.isArray(item?.Platforms) ? item.Platforms : [],
        languages: itemLanguages(item),
        clientVersions: {
            min: normalizeVersion(display.minClientVersion),
            max: normalizeVersion(display.maxClientVersion),
            variants: contentVariants(item)
        },
        subscriptions,
        prices,
        stores,
        launchLinks: launchLinks(item)
    };
}

async function fetchStores(titleId) {
    const data = await sendPlayFabRequest(titleId, "Catalog/SearchStores", {}, "X-EntityToken", 2, OS);
    const raw = data?.Stores || data?.data?.Stores || [];
    return raw.map(entry => entry?.Store || entry).filter(Boolean);
}

async function buildStoreIndex(titleId) {
    const stores = await fetchStores(titleId);
    const index = new Map();
    for (let offset = 0; offset < stores.length; offset += STORE_CONCURRENCY) {
        const chunk = stores.slice(offset, offset + STORE_CONCURRENCY);
        const resolved = await Promise.all(chunk.map(async store => {
            if (Array.isArray(store?.ItemReferences) && store.ItemReferences.length) return {store, items: []};
            const storeId = store?.Id || store?.id;
            if (!storeId) return {store, items: []};
            const data = await getStoreItems(titleId, storeId, OS);
            return {store, items: data?.Items || data?.items || []};
        }));
        for (const {store, items} of resolved) {
            for (const reference of storeReferences(store, items)) {
                const projected = projectStore(store, reference.prices);
                const current = index.get(reference.itemId) || [];
                current.push(projected);
                index.set(reference.itemId, current);
            }
        }
    }
    return index;
}

async function getStoreIndex(titleId) {
    return dataCache.getOrSetAsync(`availability:stores:${titleId}`, () => buildStoreIndex(titleId), STORE_INDEX_TTL_MS);
}

async function getAvailability(alias, itemId) {
    const titleId = resolveTitle(alias);
    const [items, storeIndex] = await Promise.all([
        getItemsByIds(titleId, [itemId], OS, 50, 1),
        getStoreIndex(titleId)
    ]);
    const item = items[0];
    if (!item) {
        const error = new Error("Item nicht gefunden.");
        error.status = 404;
        throw error;
    }
    return buildAvailability(item, storeIndex.get(item.Id || item.id) || []);
}

module.exports = {
    getAvailability,
    _internals: {
        buildAvailability,
        contentVariants,
        itemLanguages,
        itemPrices,
        isActiveWindow,
        launchLinks,
        projectStore,
        readPriceAmounts,
        storeReferences
    }
};
