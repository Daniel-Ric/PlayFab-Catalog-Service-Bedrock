// -----------------------------------------------------------------------------
//
// File: src/services/contentUpdateWatcher.js
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

const fs = require("fs");
const path = require("path");
const logger = require("../config/logger");
const {stableHash} = require("../utils/hash");
const {createNonOverlappingRunner} = require("../utils/watcherRun");
const {projectCatalogItem} = require("../utils/projectors");
const {sanitizeCatalogItem, sensitiveEventFieldsEnabled} = require("../utils/catalogSanitizer");
const {readJson, writeJsonAtomic} = require("../utils/storage");
const {_internals: itemWatcherInternals} = require("./itemWatcher");

const DEFAULT_STATE_FILE = path.join(__dirname, "../data/contentUpdateWatcherState.json");

function compactText(value) {
    if (value == null) return "";
    return String(value).trim();
}

function normalizeVersion(value) {
    if (Array.isArray(value)) return value.map(compactText).filter(Boolean).join(".");
    return compactText(value);
}

function normalizePackIdentities(item) {
    const identities = item?.DisplayProperties?.packIdentity;
    if (!Array.isArray(identities)) return [];
    return identities.map(entry => ({
        type: compactText(entry?.type).toLowerCase(),
        uuid: compactText(entry?.uuid || entry?.id).toLowerCase(),
        version: normalizeVersion(entry?.version)
    })).filter(entry => entry.type || entry.uuid || entry.version).sort((a, b) => `${a.type}|${a.uuid}`.localeCompare(`${b.type}|${b.uuid}`));
}

function contentUrlIdentity(value) {
    const raw = compactText(value);
    if (!raw) return {urlHost: "", urlFingerprint: ""};
    try {
        const parsed = new URL(raw);
        const canonical = `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname}`;
        return {urlHost: parsed.hostname.toLowerCase(), urlFingerprint: stableHash(canonical)};
    } catch {
        const canonical = raw.split(/[?#]/, 1)[0];
        return {urlHost: "", urlFingerprint: stableHash(canonical)};
    }
}

function eventExposureOptions(env = process.env) {
    return {exposeSensitive: sensitiveEventFieldsEnabled(env)};
}

function normalizeContentVariants(item, options = {}) {
    const contents = Array.isArray(item?.Contents) ? item.Contents : Array.isArray(item?.contents) ? item.contents : [];
    return contents.map(entry => {
        const rawUrl = compactText(entry?.Url || entry?.url);
        const urlIdentity = contentUrlIdentity(rawUrl);
        return {
            id: compactText(entry?.Id || entry?.id).toLowerCase(),
            url: options.exposeSensitive === true ? rawUrl : null,
            ...urlIdentity,
            type: compactText(entry?.Type || entry?.type).toLowerCase(),
            minClientVersion: normalizeVersion(entry?.MinClientVersion || entry?.minClientVersion),
            maxClientVersion: normalizeVersion(entry?.MaxClientVersion || entry?.maxClientVersion),
            tags: (Array.isArray(entry?.Tags) ? entry.Tags : []).map(compactText).filter(Boolean).sort((a, b) => a.localeCompare(b))
        };
    }).filter(entry => entry.id || entry.urlFingerprint || entry.type || entry.minClientVersion || entry.maxClientVersion || entry.tags.length)
        .sort((a, b) => `${a.id}|${a.type}`.localeCompare(`${b.id}|${b.type}`));
}

function contentRevisionOf(item, options = eventExposureOptions()) {
    const display = item?.DisplayProperties || {};
    return {
        packs: normalizePackIdentities(item),
        variants: normalizeContentVariants(item, options),
        gameVersion: normalizeVersion(display.lastUpdated),
        minClientVersion: normalizeVersion(display.minClientVersion),
        maxClientVersion: normalizeVersion(display.maxClientVersion),
        totalContentFileSize: Number.isFinite(Number(display.totalContentFileSize)) ? Number(display.totalContentFileSize) : null
    };
}

function contentRevisionIdentity(revision) {
    if (!revision || typeof revision !== "object") return revision;
    return {
        ...revision,
        variants: (revision.variants || []).map(contentVariantIdentity)
    };
}

function contentVariantIdentity(variant) {
    if (!variant || typeof variant !== "object") return variant;
    const {url: _url, ...identity} = variant;
    return identity;
}

function contentRevisionHash(item, options = eventExposureOptions()) {
    return stableHash(contentRevisionIdentity(contentRevisionOf(item, options)));
}

function normalizeStoredRevision(revision, options = eventExposureOptions()) {
    if (!revision || typeof revision !== "object") return null;
    return {
        ...revision,
        variants: (revision.variants || []).map(variant => ({
            ...variant,
            url: options.exposeSensitive === true ? compactText(variant?.url) : null
        }))
    };
}

function indexBy(values, keyOf) {
    return new Map((values || []).map(value => [keyOf(value), value]));
}

function diffContentRevisions(before, after) {
    const changes = [];
    const compareList = (kind, previous, current, keyOf, identityOf = value => value) => {
        const previousByKey = indexBy(previous, keyOf);
        const currentByKey = indexBy(current, keyOf);
        const keys = new Set([...previousByKey.keys(), ...currentByKey.keys()]);
        for (const key of keys) {
            const oldValue = previousByKey.get(key) || null;
            const newValue = currentByKey.get(key) || null;
            if (stableHash(identityOf(oldValue)) === stableHash(identityOf(newValue))) continue;
            changes.push({kind, key, before: oldValue, after: newValue});
        }
    };

    compareList("pack", before.packs, after.packs, value => value.uuid || value.type);
    compareList(
        "content",
        before.variants,
        after.variants,
        value => value.id || `${value.type}|${value.minClientVersion}`,
        contentVariantIdentity
    );
    for (const field of ["gameVersion", "minClientVersion", "maxClientVersion", "totalContentFileSize"]) {
        if (before[field] !== after[field]) changes.push({kind: "property", key: field, before: before[field], after: after[field]});
    }
    return changes;
}

function diffRevision(beforeItem, afterItem, options = eventExposureOptions()) {
    return diffContentRevisions(contentRevisionOf(beforeItem, options), contentRevisionOf(afterItem, options));
}

function stateFilePath() {
    return process.env.CONTENT_UPDATE_WATCH_STATE_FILE || DEFAULT_STATE_FILE;
}

function serializeState(state, options = eventExposureOptions()) {
    return Array.from(state.entries()).map(([id, entry]) => {
        const sourceItem = entry.item || entry.raw || null;
        const revision = normalizeStoredRevision(entry.revision, options)
            || (sourceItem ? contentRevisionOf(sourceItem, options) : null);
        return {
            id,
            hash: revision ? stableHash(contentRevisionIdentity(revision)) : entry.hash,
            revision,
            item: sanitizeCatalogItem(sourceItem, options)
        };
    }).filter(entry => entry.id && entry.hash);
}

function deserializeState(entries, options = eventExposureOptions()) {
    const state = new Map();
    if (!Array.isArray(entries)) return state;
    for (const entry of entries) {
        const sourceItem = entry?.item || entry?.raw || null;
        const id = entry?.id || sourceItem?.Id || sourceItem?.id;
        const revision = normalizeStoredRevision(entry?.revision, options) || (sourceItem ? contentRevisionOf(sourceItem, options) : null);
        if (!id || !revision) continue;
        state.set(id, {
            hash: stableHash(contentRevisionIdentity(revision)),
            revision,
            item: sanitizeCatalogItem(sourceItem, options)
        });
    }
    return state;
}

function snapshotContentItem(item, options = eventExposureOptions()) {
    const revision = contentRevisionOf(item, options);
    return {
        hash: stableHash(contentRevisionIdentity(revision)),
        revision,
        item: sanitizeCatalogItem(item, options)
    };
}

function loadPersistedState() {
    try {
        const filePath = stateFilePath();
        if (!fs.existsSync(filePath)) return {state: new Map(), loaded: false};
        return {state: deserializeState(readJson(filePath, [])), loaded: true};
    } catch (err) {
        logger.warn(`[ContentUpdateWatcher] failed to load state file: ${err.message}`);
        return {state: new Map(), loaded: false};
    }
}

function savePersistedState(state) {
    try {
        writeJsonAtomic(stateFilePath(), serializeState(state));
    } catch (err) {
        logger.warn(`[ContentUpdateWatcher] failed to save state file: ${err.message}`);
    }
}

function buildContentUpdate(previous, current, options = eventExposureOptions()) {
    if (!previous || !current) return null;
    const currentSnapshot = snapshotContentItem(current, options);
    const hash = currentSnapshot.hash;
    if (previous.hash === hash) return null;
    const previousRevision = normalizeStoredRevision(previous.revision, options)
        || contentRevisionOf(previous.item || previous.raw, options);
    const changes = diffContentRevisions(previousRevision, currentSnapshot.revision);
    if (!changes.length) return null;
    return {
        id: current.Id || current.id,
        before: sanitizeCatalogItem(previous.item || previous.raw, options),
        after: currentSnapshot.item,
        changes,
        hash
    };
}

class ContentUpdateWatcher {
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
        const intervalMs = Math.max(10000, parseInt(process.env.CONTENT_UPDATE_WATCH_INTERVAL_MS || "30000", 10));
        const itemsPerRequest = Math.max(10, parseInt(process.env.CONTENT_UPDATE_WATCH_ITEMS_PER_REQUEST || "200", 10));
        const maxItems = Math.max(itemsPerRequest, parseInt(process.env.CONTENT_UPDATE_WATCH_MAX_ITEMS || "10000", 10));
        const overlapMs = Math.max(0, parseInt(process.env.CONTENT_UPDATE_WATCH_OVERLAP_MS || "60000", 10));

        const run = async () => {
            const titleId = itemWatcherInternals.getTitleId();
            if (!this.bootstrapped) {
                const recent = await itemWatcherInternals.fetchBootstrapItems(titleId, os, itemsPerRequest, maxItems, 0);
                const persisted = loadPersistedState();
                const nextState = new Map(persisted.state);
                const updates = [];
                for (const item of recent) {
                    const id = item.Id || item.id;
                    if (!id) continue;
                    const previous = persisted.state.get(id) || null;
                    const update = persisted.loaded ? buildContentUpdate(previous, item) : null;
                    if (update) updates.push(update);
                    nextState.set(id, snapshotContentItem(item));
                }
                this.state = nextState;
                this.lastRunTs = Date.now();
                this.bootstrapped = true;
                this.emitUpdates(eventBus, updates);
                savePersistedState(this.state);
                return;
            }

            const sinceTs = Math.max(0, (this.lastRunTs || Date.now()) - overlapMs);
            const sinceIso = new Date(sinceTs).toISOString();
            const changed = await itemWatcherInternals.requestChangedItems(titleId, os, sinceIso, itemsPerRequest, maxItems, sinceIso);
            const updates = [];
            for (const item of changed) {
                const id = item.Id || item.id;
                if (!id) continue;
                const previous = this.state.get(id) || null;
                const update = buildContentUpdate(previous, item);
                if (update) updates.push(update);
                this.state.set(id, snapshotContentItem(item));
            }
            this.emitUpdates(eventBus, updates);
            savePersistedState(this.state);
            this.lastRunTs = Date.now();
        };

        const runOnce = createNonOverlappingRunner({
            run,
            onError: err => logger.error(`[ContentUpdateWatcher] run failed: ${err.stack || err.message}`),
            onSkip: () => logger.debug("[ContentUpdateWatcher] previous run still in progress; skipping tick")
        });
        runOnce();
        this.timer = setInterval(runOnce, intervalMs);
    }

    emitUpdates(eventBus, updates) {
        if (!updates.length) return;
        eventBus.emit("item.content.updated", {
            ts: Date.now(),
            count: updates.length,
            items: updates.map(update => ({
                id: update.id,
                before: projectCatalogItem(update.before),
                after: projectCatalogItem(update.after),
                changes: update.changes
            }))
        });
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const contentUpdateWatcher = new ContentUpdateWatcher();
module.exports = {
    contentUpdateWatcher,
    _internals: {
        normalizePackIdentities,
        normalizeContentVariants,
        contentUrlIdentity,
        eventExposureOptions,
        contentRevisionOf,
        contentRevisionIdentity,
        contentRevisionHash,
        normalizeStoredRevision,
        diffContentRevisions,
        diffRevision,
        buildContentUpdate,
        snapshotContentItem,
        serializeState,
        deserializeState
    }
};
