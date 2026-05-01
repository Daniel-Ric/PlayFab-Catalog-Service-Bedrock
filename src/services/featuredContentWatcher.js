// -----------------------------------------------------------------------------
//
// File: src/services/featuredContentWatcher.js
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

const logger = require("../config/logger");
const {resolveTitle} = require("../utils/titles");
const {fetchFeaturedPersona} = require("./featuredPersonaService");

function featuredItemId(item) {
    if (!item || typeof item !== "object") return null;
    return item.id || item.Id || item.itemId || item.ItemId || null;
}

function normalizeId(id) {
    if (id === undefined || id === null || id === "") return null;
    return String(id);
}

function firstTextValue(components) {
    if (!Array.isArray(components)) return null;
    for (const component of components) {
        const value = component?.text?.value;
        if (value) return value;
    }
    return null;
}

function summarizePage(page) {
    if (!page || typeof page !== "object") return null;
    return {
        id: page.id || null,
        pageId: page.pageId || null,
        pageName: page.pageName || null
    };
}

function summarizeComponent(component, componentIndex) {
    return {
        index: componentIndex,
        type: component?.type || null,
        controlType: component?.$type || null,
        totalItems: typeof component?.totalItems === "number" ? component.totalItems : null,
        linksTo: component?.linksTo || null,
        linksToInfo: component?.linksToInfo || null,
        customStoreRowConfiguration: component?.customStoreRowConfiguration || null
    };
}

function collectFeaturedItemEntries(payload) {
    const page = payload?.result && typeof payload.result === "object" ? payload.result : payload;
    const rows = Array.isArray(page?.rows) ? page.rows : [];
    const entries = [];
    const pageInfo = summarizePage(page);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const components = Array.isArray(row?.components) ? row.components : [];
        const rowInfo = {
            index: rowIndex,
            controlId: row?.controlId || null,
            telemetryId: row?.telemetryId || null,
            header: firstTextValue(components)
        };

        for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
            const component = components[componentIndex];
            if (!Array.isArray(component?.items)) continue;

            const componentInfo = summarizeComponent(component, componentIndex);
            for (let itemIndex = 0; itemIndex < component.items.length; itemIndex++) {
                const item = component.items[itemIndex];
                const id = normalizeId(featuredItemId(item));
                if (!id) continue;
                entries.push({
                    id,
                    item,
                    itemIndex,
                    page: pageInfo,
                    row: rowInfo,
                    component: componentInfo
                });
            }
        }
    }

    if (entries.length) return entries;

    return collectFeaturedItemEntriesFallback(payload);
}

function collectFeaturedItemEntriesFallback(payload) {
    const entries = [];

    const visit = node => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) {
            for (const entry of node) visit(entry);
            return;
        }
        if (Array.isArray(node.items)) {
            for (let itemIndex = 0; itemIndex < node.items.length; itemIndex++) {
                const item = node.items[itemIndex];
                const id = normalizeId(featuredItemId(item));
                if (!id) continue;
                entries.push({
                    id,
                    item,
                    itemIndex,
                    page: null,
                    row: null,
                    component: null
                });
            }
        }
        for (const value of Object.values(node)) visit(value);
    };

    visit(payload);
    return entries;
}

function collectFeaturedItems(payload) {
    return collectFeaturedItemEntries(payload).map(entry => entry.item);
}

function uniqueIdsFromEntries(entries) {
    const seen = new Set();
    const ids = [];
    for (const entry of entries || []) {
        const id = normalizeId(entry?.id || featuredItemId(entry?.item || entry));
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}

function uniqueIdsFromItems(items) {
    return uniqueIdsFromEntries((items || []).map(item => ({id: featuredItemId(item), item})));
}

function entryMapById(entries) {
    const map = new Map();
    for (const entry of entries || []) {
        const id = normalizeId(entry?.id || featuredItemId(entry?.item));
        if (id && !map.has(id)) map.set(id, entry);
    }
    return map;
}

function entriesForIds(ids, entryMap) {
    return (ids || []).map(id => entryMap.get(normalizeId(id))).filter(Boolean);
}

function detailsFromEntries(entries) {
    return (entries || []).map(entry => ({
        ...(entry.item || {}),
        featuredContext: {
            page: entry.page || null,
            row: entry.row || null,
            component: entry.component || null,
            itemIndex: typeof entry.itemIndex === "number" ? entry.itemIndex : null
        }
    }));
}

function buildFeaturedContentChangePayload({
                                               titleId,
                                               previousEntries,
                                               currentEntries,
                                               previousItems,
                                               currentItems,
                                               content,
                                               previousContentSignature,
                                               currentContentSignature,
                                               ts = Date.now()
                                           }) {
    const prevEntries = previousEntries || (previousItems || []).map(item => ({id: featuredItemId(item), item}));
    const currEntries = currentEntries || (currentItems || []).map(item => ({id: featuredItemId(item), item}));
    const previousItemIds = uniqueIdsFromEntries(prevEntries);
    const currentItemIds = uniqueIdsFromEntries(currEntries);
    const previousSet = new Set(previousItemIds);
    const currentSet = new Set(currentItemIds);

    const addedItemIds = currentItemIds.filter(id => !previousSet.has(id));
    const removedItemIds = previousItemIds.filter(id => !currentSet.has(id));

    const previousMap = entryMapById(prevEntries);
    const currentMap = entryMapById(currEntries);
    const changedItemIds = changedIdsFromEntryMaps(previousItemIds, previousMap, currentMap);
    const contentChanged = Boolean(previousContentSignature && currentContentSignature && previousContentSignature !== currentContentSignature);

    if (!addedItemIds.length && !removedItemIds.length && !changedItemIds.length && !contentChanged) return null;

    const addedEntries = entriesForIds(addedItemIds, currentMap);
    const removedEntries = entriesForIds(removedItemIds, previousMap);
    const changedEntries = entriesForIds(changedItemIds, currentMap);
    const currentEntriesOrdered = entriesForIds(currentItemIds, currentMap);
    const previousEntriesOrdered = entriesForIds(previousItemIds, previousMap);

    return {
        ts,
        titleId,
        addedItemIds,
        removedItemIds,
        changedItemIds,
        addedItems: addedEntries.map(entry => entry.item),
        removedItems: removedEntries.map(entry => entry.item),
        changedItems: changedEntries.map(entry => entry.item),
        addedItemDetails: detailsFromEntries(addedEntries),
        removedItemDetails: detailsFromEntries(removedEntries),
        changedItemDetails: detailsFromEntries(changedEntries),
        currentItemIds,
        previousItemIds,
        currentItemDetails: detailsFromEntries(currentEntriesOrdered),
        previousItemDetails: detailsFromEntries(previousEntriesOrdered),
        contentChanged,
        previousContentSignature: previousContentSignature || null,
        currentContentSignature: currentContentSignature || null,
        content
    };
}

function getTitleId() {
    const alias = (process.env.FEATURED_PRIMARY_ALIAS || process.env.DEFAULT_ALIAS || "").trim();
    if (alias) {
        try {
            return resolveTitle(alias);
        } catch {
        }
    }
    return process.env.TITLE_ID || "20CA2";
}

class FeaturedContentWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.lastItemIds = null;
        this.lastEntries = [];
        this.lastContentSignature = null;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;

        const intervalMs = Math.max(60000, parseInt(process.env.FEATURED_CONTENT_WATCH_INTERVAL_MS || "21600000", 10));

        const run = async () => {
            try {
                const titleId = getTitleId();
                const payload = await fetchFeaturedPersona(titleId);
                const entries = collectFeaturedItemEntries(payload);
                const currentItemIds = uniqueIdsFromEntries(entries);
                const currentItemIdsSet = new Set(currentItemIds);
                const currentContentSignature = featuredContentSignature(payload, entries);

                if (!this.lastItemIds) {
                    this.lastItemIds = currentItemIdsSet;
                    this.lastEntries = entries;
                    this.lastContentSignature = currentContentSignature;
                    return;
                }

                const previousItemIds = Array.from(this.lastItemIds);
                const addedItemIds = currentItemIds.filter(id => !this.lastItemIds.has(id));
                const removedItemIds = previousItemIds.filter(id => !currentItemIdsSet.has(id));
                const contentChanged = this.lastContentSignature !== currentContentSignature;

                if (addedItemIds.length || removedItemIds.length || contentChanged) {
                    const eventPayload = buildFeaturedContentChangePayload({
                        titleId,
                        previousEntries: this.lastEntries,
                        currentEntries: entries,
                        previousContentSignature: this.lastContentSignature,
                        currentContentSignature,
                        content: payload
                    });

                    this.lastItemIds = currentItemIdsSet;
                    this.lastEntries = entries;
                    this.lastContentSignature = currentContentSignature;

                    if (eventPayload) {
                        eventBus.emit("featured.content.updated", eventPayload);
                    }
                    return;
                }

                this.lastItemIds = currentItemIdsSet;
                this.lastEntries = entries;
                this.lastContentSignature = currentContentSignature;
            } catch (e) {
                logger.debug(`[FeaturedContentWatcher] error ${e.message || "err"}`);
            }
        };

        run();
        this.timer = setInterval(run, intervalMs);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const featuredContentWatcher = new FeaturedContentWatcher();
module.exports = {
    featuredContentWatcher,
    _internals: {
        collectFeaturedItemEntries,
        collectFeaturedItems,
        uniqueIdsFromItems,
        uniqueIdsFromEntries,
        buildFeaturedContentChangePayload
    }
};
