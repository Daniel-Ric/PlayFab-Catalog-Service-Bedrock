// -----------------------------------------------------------------------------
//
// File: src/services/itemWatcher.js
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
const fs = require("fs");
const path = require("path");
const {sendPlayFabRequest, isValidItem, getItemsByIds} = require("../utils/playfab");
const {resolveTitle} = require("../utils/titles");
const {stableHash} = require("../utils/hash");
const {createNonOverlappingRunner} = require("../utils/watcherRun");
const {projectCatalogItems, projectCatalogItem} = require("../utils/projectors");
const {readJson, writeJsonAtomic} = require("../utils/storage");
const SEARCH_ITEMS_MAX_COUNT = 50;
const DEFAULT_STATE_FILE = path.join(__dirname, "../data/itemWatcherState.json");
let searchItemsUnavailable = false;

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

function startDateOf(it) {
    return it.StartDate || it.startDate || it.DisplayProperties?.startDate || it.CreationDate || it.creationDate || null;
}

function creationDateOf(it) {
    return it.CreationDate || it.creationDate || null;
}

function lastModifiedDateOf(it) {
    return it.LastModifiedDate || it.lastModifiedDate || null;
}

function tsOf(v) {
    if (!v) return 0;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
}

function toFilterDateLiteral(iso) {
    const parsed = new Date(iso);
    if (!Number.isFinite(parsed.getTime())) return "1970-01-01T00:00:00.000Z";
    return `${parsed.toISOString()}`;
}

function hashItemCore(it) {
    const core = {
        Id: it.Id || it.id,
        Title: it.Title,
        Description: it.Description,
        Tags: it.Tags,
        ContentType: it.ContentType || it.contentType,
        Platforms: it.Platforms,
        Images: Array.isArray(it.Images) ? it.Images.map(i => [i.Tag || i.tag, i.Url || i.url]) : [],
        DisplayProperties: it.DisplayProperties,
        ETag: it.ETag,
        LastModifiedDate: lastModifiedDateOf(it),
        StartDate: startDateOf(it),
        CreationDate: creationDateOf(it)
    };
    return stableHash(core);
}

async function fetchRecentItems(titleId, os, itemsPerRequest, maxItems) {
    const field = "lastModifiedDate";
    const orderBy = `${field} desc`;
    const filter = "";

    return collectPaginatedItems(itemsPerRequest, maxItems, (continuationToken, count) => requestItems(titleId, os, filter, orderBy, continuationToken, count));
}

async function fetchBootstrapItems(titleId, os, itemsPerRequest, maxItems, createdLookbackMs) {
    const itemMap = new Map();
    const addItems = items => {
        for (const it of items || []) {
            const id = it.Id || it.id;
            if (!id) continue;
            itemMap.set(id, it);
        }
    };

    addItems(await fetchRecentItems(titleId, os, itemsPerRequest, maxItems));

    if (createdLookbackMs > 0) {
        const createdSinceIso = new Date(Math.max(0, Date.now() - createdLookbackMs)).toISOString();
        addItems(await fetchItemsSince(titleId, os, "StartDate", createdSinceIso, itemsPerRequest, maxItems));
        addItems(await fetchItemsSince(titleId, os, "CreationDate", createdSinceIso, itemsPerRequest, maxItems));
    }

    return Array.from(itemMap.values()).slice(0, maxItems);
}

function shouldFetchNextPage(nextToken, previousToken, seenTokens) {
    if (!nextToken) return false;
    if (nextToken === previousToken) return false;
    if (seenTokens && seenTokens.has(nextToken)) return false;
    if (seenTokens) seenTokens.add(nextToken);
    return true;
}

async function collectPaginatedItems(itemsPerRequest, maxItems, loadPage) {
    const allItems = [];
    let continuationToken = null;
    let scannedHits = 0;
    const seenContinuationTokens = new Set();

    while (scannedHits < maxItems) {
        const remaining = maxItems - scannedHits;
        const count = Math.min(itemsPerRequest, remaining);
        const page = await loadPage(continuationToken, count);
        const pageItems = page.items || [];
        const previousToken = continuationToken;
        const hitCount = Number.isFinite(page.hitCount) ? page.hitCount : pageItems.length;

        scannedHits += Math.max(0, hitCount);
        allItems.push(...pageItems);
        continuationToken = page.continuationToken || null;
        if (!shouldFetchNextPage(continuationToken, previousToken, seenContinuationTokens)) break;
        if (hitCount <= 0) break;
    }

    return allItems.slice(0, maxItems);
}

function normalizeFieldSpec(field) {
    const f = String(field || "");
    if (f === "CreationDate" || f === "creationDate") return {primary: "creationDate", fallback: "CreationDate"};
    if (f === "StartDate" || f === "startDate") return {primary: "startDate", fallback: "StartDate"};
    if (f === "LastModifiedDate" || f === "lastModifiedDate") return {primary: "lastModifiedDate", fallback: "LastModifiedDate"};
    return {primary: f, fallback: f.toLowerCase()};
}

function idOfSearchHit(hit) {
    if (!hit) return null;
    return hit.Id || hit.id || hit.Item?.Id || hit.Item?.id || hit.ItemId || hit.itemId || null;
}

function itemFromSearchHit(hit) {
    if (!hit) return null;
    return hit.Item || hit.item || hit;
}

async function searchItemsPage(titleId, os, filter, orderBy, continuationToken, count) {
    const safeCount = Math.max(1, Math.min(SEARCH_ITEMS_MAX_COUNT, parseInt(count, 10) || SEARCH_ITEMS_MAX_COUNT));
    const payload = {
        Filter: filter, OrderBy: orderBy, ContinuationToken: continuationToken, Count: safeCount
    };

    if (searchItemsUnavailable) {
        return await searchItemsPageFallback(titleId, os, filter, orderBy, continuationToken, safeCount);
    }

    try {
        const data = await sendPlayFabRequest(titleId, "Catalog/SearchItems", payload, "X-EntityToken", 3, os);
        return data || {};
    } catch (err) {
        searchItemsUnavailable = true;
        logger.warn(`[ItemWatcher] Catalog/SearchItems failed, falling back to Catalog/Search for this process: ${err.message}`);
        return await searchItemsPageFallback(titleId, os, filter, orderBy, continuationToken, safeCount);
    }
}

async function searchItemsPageFallback(titleId, os, filter, orderBy, continuationToken, safeCount) {
    const offset = parseFallbackOffset(continuationToken);
    const data = await sendPlayFabRequest(titleId, "Catalog/Search", {
        Filter: filter,
        OrderBy: orderBy,
        Top: safeCount,
        Skip: offset,
        Expand: "Images"
    }, "X-EntityToken", 3, os);

    const items = data?.Items || data?.items || [];
    return {
        Items: items,
        ContinuationToken: items.length >= safeCount ? makeFallbackOffset(offset + items.length) : null
    };
}

function parseFallbackOffset(token) {
    const raw = String(token || "");
    if (!raw.startsWith("offset:")) return 0;
    const n = parseInt(raw.slice("offset:".length), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function makeFallbackOffset(offset) {
    return `offset:${Math.max(0, offset)}`;
}

async function getItemsCompat(titleId, os, ids) {
    const list = Array.from(new Set((ids || []).filter(Boolean)));
    if (!list.length) return [];
    const payload = {Ids: list, Expand: "Images"};
    try {
        const r = await sendPlayFabRequest(titleId, "Catalog/GetItems", payload, "X-EntityToken", 3, os);
        const items = r?.Items || r?.items || [];
        if (items && items.length) return items;
    } catch {
    }
    return await getItemsByIds(titleId, list, os, 100, 5);
}

async function requestItems(titleId, os, filter, orderBy, continuationToken, count) {
    const data = await searchItemsPage(titleId, os, filter, orderBy, continuationToken, count);
    const hits = data.Items || data.items || [];
    const nextToken = data.ContinuationToken || data.continuationToken || null;
    if (!hits.length) return {items: [], continuationToken: nextToken, hitCount: 0};

    const ids = hits.map(idOfSearchHit).filter(Boolean);
    const full = await getItemsCompat(titleId, os, ids);
    const fallbackItems = hits.map(itemFromSearchHit).filter(Boolean);
    const items = ((full && full.length) ? full : fallbackItems).filter(isValidItem);
    return {items, continuationToken: nextToken, hitCount: hits.length};
}

async function fetchItemsSince(titleId, os, field, sinceIso, itemsPerRequest, maxItems) {
    const {primary, fallback} = normalizeFieldSpec(field);
    const candidates = Array.from(new Set([primary, fallback].filter(Boolean)));
    let lastErr = null;

    for (const f of candidates) {
        const filter = `(${f} ge ${toFilterDateLiteral(sinceIso)})`;
        const orderBy = `${f} asc`;

        try {
            return await collectPaginatedItems(itemsPerRequest, maxItems, (continuationToken, count) => requestItems(titleId, os, filter, orderBy, continuationToken, count));
        } catch (e) {
            lastErr = e;
        }
    }

    if (lastErr) throw lastErr;
    return [];
}

function buildChangedItemRequests(instantSinceIso, createdSinceIso = instantSinceIso) {
    const createdSince = createdSinceIso || instantSinceIso;
    return [
        {field: "CreationDate", sinceIso: createdSince},
        {field: "StartDate", sinceIso: createdSince},
        {field: "LastModifiedDate", sinceIso: instantSinceIso}
    ];
}

function stateFilePath() {
    return process.env.ITEM_WATCH_STATE_FILE || DEFAULT_STATE_FILE;
}

function serializeState(state) {
    return Array.from(state.entries()).map(([id, entry]) => ({
        id,
        hash: entry?.hash || null,
        raw: entry?.raw || null,
        createdNotified: entry?.createdNotified === false ? false : true
    })).filter(entry => entry.id && entry.hash);
}

function deserializeState(entries) {
    const state = new Map();
    if (!Array.isArray(entries)) return state;
    for (const entry of entries) {
        const id = entry?.id || entry?.raw?.Id || entry?.raw?.id;
        const hash = entry?.hash;
        if (!id || !hash) continue;
        state.set(id, {
            hash,
            raw: entry.raw || null,
            createdNotified: entry.createdNotified === false ? false : true
        });
    }
    return state;
}

function hasCreatedBeenNotified(prev) {
    return !prev || prev.createdNotified !== false;
}

function loadPersistedState() {
    try {
        const filePath = stateFilePath();
        if (!fs.existsSync(filePath)) {
            return {state: new Map(), loaded: false};
        }
        return {state: deserializeState(readJson(filePath, [])), loaded: true};
    } catch (err) {
        logger.warn(`[ItemWatcher] failed to load state file: ${err.message}`);
        return {state: new Map(), loaded: false};
    }
}

function savePersistedState(state) {
    try {
        writeJsonAtomic(stateFilePath(), serializeState(state));
    } catch (err) {
        logger.warn(`[ItemWatcher] failed to save state file: ${err.message}`);
    }
}

function classifyBootstrapItemChange(it, prev, createdSinceTs, updatedSinceTs) {
    const nextHash = hashItemCore(it);
    const startTs = tsOf(startDateOf(it));
    const creationTs = tsOf(creationDateOf(it));
    const modTs = tsOf(lastModifiedDateOf(it));
    const looksRecentlyCreated = (startTs && startTs >= createdSinceTs) || (creationTs && creationTs >= createdSinceTs);
    const looksRecentlyUpdated = modTs && modTs >= updatedSinceTs;

    if (!prev) {
        return {kind: looksRecentlyCreated ? "created" : null, nextHash, createdNotified: !looksRecentlyCreated};
    }

    if (!hasCreatedBeenNotified(prev) && looksRecentlyCreated) {
        return {kind: "created", nextHash, createdNotified: true};
    }

    if (prev.hash !== nextHash && looksRecentlyUpdated) {
        return {kind: "updated", nextHash, createdNotified: true};
    }

    return {kind: null, nextHash, createdNotified: hasCreatedBeenNotified(prev)};
}

async function requestChangedItems(titleId, os, instantSinceIso, itemsPerRequest, maxItems, createdSinceIso = instantSinceIso) {
    const itemMap = new Map();
    const requests = buildChangedItemRequests(instantSinceIso, createdSinceIso);

    for (const request of requests) {
        const list = await fetchItemsSince(titleId, os, request.field, request.sinceIso, itemsPerRequest, maxItems);
        for (const it of list) {
            const id = it.Id || it.id;
            if (!id) continue;
            itemMap.set(id, it);
        }
    }

    return Array.from(itemMap.values());
}

function classifyItemChange(it, prev, updatedSinceTs, createdSinceTs = updatedSinceTs) {
    const creationTs = tsOf(creationDateOf(it));
    const startTs = tsOf(startDateOf(it));
    const modTs = tsOf(lastModifiedDateOf(it));
    const nextHash = hashItemCore(it);

    const isFirstSeen = !prev;
    const hasChanged = !prev || prev.hash !== nextHash;
    const looksRecentlyCreated = (startTs && startTs >= createdSinceTs) || (creationTs && creationTs >= createdSinceTs);
    const looksRecentlyUpdated = modTs && modTs >= updatedSinceTs;

    if (isFirstSeen) {
        if (looksRecentlyCreated) {
            return {kind: "created", nextHash, createdNotified: true};
        }
        if (looksRecentlyUpdated) {
            return {kind: "updated", nextHash, createdNotified: true};
        }
        if (hasChanged) {
            return {kind: "created", nextHash, createdNotified: true};
        }
        return {kind: null, nextHash, createdNotified: true};
    }

    if (!hasCreatedBeenNotified(prev) && looksRecentlyCreated) {
        return {kind: "created", nextHash, createdNotified: true};
    }

    if (hasChanged && looksRecentlyUpdated) {
        return {kind: "updated", nextHash, createdNotified: hasCreatedBeenNotified(prev)};
    }

    return {kind: null, nextHash, createdNotified: hasCreatedBeenNotified(prev)};
}

class ItemWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.state = new Map();
        this.lastRunTs = 0;
        this.bootstrapped = false;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;

        const os = process.env.OS || "iOS";
        const intervalMs = Math.max(10000, parseInt(process.env.ITEM_WATCH_INTERVAL_MS || "30000", 10));
        const itemsPerRequest = Math.max(10, parseInt(process.env.ITEM_WATCH_ITEMS_PER_REQUEST || "200", 10));
        const maxItems = Math.max(itemsPerRequest, parseInt(process.env.ITEM_WATCH_MAX_ITEMS || "10000", 10));
        const bootstrapItemsPerRequest = Math.max(10, parseInt(process.env.ITEM_WATCH_BOOTSTRAP_ITEMS_PER_REQUEST || String(itemsPerRequest), 10));
        const bootstrapMaxItems = Math.max(bootstrapItemsPerRequest, parseInt(process.env.ITEM_WATCH_BOOTSTRAP_MAX_ITEMS || String(maxItems), 10));
        const overlapMs = Math.max(0, parseInt(process.env.ITEM_WATCH_OVERLAP_MS || "60000", 10));
        const createdLookbackMs = Math.max(overlapMs, parseInt(process.env.ITEM_WATCH_CREATED_LOOKBACK_MS || "86400000", 10));

        const run = async () => {
            const titleId = getTitleId();

            if (!this.bootstrapped) {
                const recent = await fetchBootstrapItems(titleId, os, bootstrapItemsPerRequest, bootstrapMaxItems, createdLookbackMs);
                const persisted = loadPersistedState();
                const bootstrapMap = new Map(persisted.state);
                const created = [];
                const updated = [];
                const createdSinceTs = Math.max(0, Date.now() - createdLookbackMs);
                const updatedSinceTs = Math.max(0, Date.now() - overlapMs);

                for (const it of recent) {
                    const id = it.Id || it.id;
                    if (!id) continue;
                    const prev = persisted.state.get(id) || null;
                    const {kind, nextHash, createdNotified} = classifyBootstrapItemChange(it, prev, createdSinceTs, updatedSinceTs);
                    const createdWasEmitted = persisted.loaded && kind === "created";
                    if (persisted.loaded && kind === "created") {
                        created.push(it);
                    } else if (persisted.loaded && kind === "updated") {
                        updated.push({
                            id, before: prev ? prev.raw : null, after: it
                        });
                    }
                    bootstrapMap.set(id, {
                        hash: nextHash,
                        raw: it,
                        createdNotified: kind === "created" ? createdWasEmitted : createdNotified
                    });
                }
                this.state = bootstrapMap;
                this.lastRunTs = Date.now();
                this.bootstrapped = true;
                eventBus.emit("item.snapshot", {
                    ts: Date.now(), count: recent.length, items: projectCatalogItems(recent)
                });
                if (created.length > 0) {
                    eventBus.emit("item.created", {
                        ts: Date.now(), count: created.length, items: projectCatalogItems(created)
                    });
                }
                if (updated.length > 0) {
                    eventBus.emit("item.updated", {
                        ts: Date.now(), count: updated.length, items: updated.map(pair => ({
                            id: pair.id,
                            before: pair.before ? projectCatalogItem(pair.before) : null,
                            after: projectCatalogItem(pair.after)
                        }))
                    });
                }
                savePersistedState(this.state);
                return;
            }

            const sinceTs = Math.max(0, (this.lastRunTs || Date.now()) - overlapMs);
            const sinceIso = new Date(sinceTs).toISOString();
            const createdSinceTs = Math.max(0, Date.now() - createdLookbackMs);
            const createdSinceIso = new Date(createdSinceTs).toISOString();

            const changed = await requestChangedItems(titleId, os, sinceIso, itemsPerRequest, maxItems, createdSinceIso);
            if (!changed.length) {
                this.lastRunTs = Date.now();
                return;
            }

            const created = [];
            const updated = [];

            for (const it of changed) {
                const id = it.Id || it.id;
                if (!id) continue;

                const prev = this.state.get(id) || null;
                const {kind, nextHash, createdNotified} = classifyItemChange(it, prev, sinceTs, createdSinceTs);

                if (kind === "created") {
                    created.push(it);
                } else if (kind === "updated") {
                    updated.push({
                        id, before: prev ? prev.raw : null, after: it
                    });
                }

                this.state.set(id, {
                    hash: nextHash,
                    raw: it,
                    createdNotified
                });
            }

            if (created.length > 0) {
                eventBus.emit("item.created", {
                    ts: Date.now(), count: created.length, items: projectCatalogItems(created)
                });
            }

            if (updated.length > 0) {
                eventBus.emit("item.updated", {
                    ts: Date.now(), count: updated.length, items: updated.map(pair => ({
                        id: pair.id,
                        before: pair.before ? projectCatalogItem(pair.before) : null,
                        after: projectCatalogItem(pair.after)
                    }))
                });
            }

            savePersistedState(this.state);
            this.lastRunTs = Date.now();
        };

        const runOnce = createNonOverlappingRunner({
            run,
            onError: err => {
                logger.error(`[ItemWatcher] run failed: ${err.stack || err.message}`);
            },
            onSkip: () => logger.debug("[ItemWatcher] previous run still in progress; skipping tick")
        });
        runOnce();
        this.timer = setInterval(runOnce, intervalMs);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const itemWatcher = new ItemWatcher();
module.exports = {
    itemWatcher,
    _internals: {
        classifyItemChange,
        parseFallbackOffset,
        makeFallbackOffset,
        shouldFetchNextPage,
        collectPaginatedItems,
        searchItemsPageFallback,
        buildChangedItemRequests,
        classifyBootstrapItemChange,
        serializeState,
        deserializeState
    }
};
