// -----------------------------------------------------------------------------
//
// File: src/services/subscriptionWatcher.js
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
const marketplaceService = require("./marketplaceService");
const {resolveTitle} = require("../utils/titles");
const {projectCatalogItem} = require("../utils/projectors");
const {readJson, writeJsonAtomic} = require("../utils/storage");
const {stableHash} = require("../utils/hash");
const {
    SUBSCRIPTION_DEFS,
    getItemSubscriptionInfo,
    itemDisplayProperties,
    itemTags,
    subscriptionEventName
} = require("../utils/marketplaceSubscriptions");

const DEFAULT_STATE_FILE = path.join(__dirname, "../data/subscriptionWatcherState.json");

function getAlias() {
    const alias = (process.env.FEATURED_PRIMARY_ALIAS || process.env.DEFAULT_ALIAS || "").trim();
    if (alias) {
        try {
            resolveTitle(alias);
            return alias;
        } catch {
        }
    }
    return "prod";
}

function stateFilePath() {
    return process.env.SUBSCRIPTION_WATCH_STATE_FILE || DEFAULT_STATE_FILE;
}

function itemId(item) {
    return item?.Id || item?.id || null;
}

function itemImages(item) {
    if (Array.isArray(item?.Images)) return item.Images;
    if (Array.isArray(item?.images)) return item.images;
    return [];
}

function lastModifiedDateOf(item) {
    return item?.LastModifiedDate || item?.lastModifiedDate || null;
}

function startDateOf(item) {
    return item?.StartDate || item?.startDate || null;
}

function creationDateOf(item) {
    return item?.CreationDate || item?.creationDate || null;
}

function hashSubscriptionItem(item, subscriptionKey) {
    const core = {
        Id: itemId(item),
        Title: item?.Title || item?.title,
        Description: item?.Description || item?.description,
        Tags: itemTags(item).map(tag => String(tag).toLowerCase()).sort(),
        ContentType: item?.ContentType || item?.contentType,
        Platforms: item?.Platforms || item?.platforms,
        Images: itemImages(item).map(i => [i.Tag || i.tag, i.Type || i.type, i.Url || i.url]),
        DisplayProperties: itemDisplayProperties(item),
        ETag: item?.ETag || item?.etag,
        LastModifiedDate: lastModifiedDateOf(item),
        StartDate: startDateOf(item),
        CreationDate: creationDateOf(item),
        subscription: getItemSubscriptionInfo(item, subscriptionKey)
    };
    return stableHash(core);
}

function serializeState(state) {
    const out = {};
    for (const key of Object.keys(SUBSCRIPTION_DEFS)) {
        const entries = state[key] instanceof Map ? state[key] : new Map();
        out[key] = Array.from(entries.values()).filter(item => itemId(item));
    }
    return out;
}

function deserializeState(raw) {
    const state = {};
    for (const key of Object.keys(SUBSCRIPTION_DEFS)) {
        state[key] = new Map();
        const items = Array.isArray(raw?.[key]) ? raw[key] : [];
        for (const item of items) {
            const id = itemId(item);
            if (id) state[key].set(id, item);
        }
    }
    return state;
}

function loadPersistedState() {
    try {
        const filePath = stateFilePath();
        if (!fs.existsSync(filePath)) return {state: deserializeState({}), loaded: false};
        return {state: deserializeState(readJson(filePath, {})), loaded: true};
    } catch (err) {
        logger.warn(`[SubscriptionWatcher] failed to load state file: ${err.message}`);
        return {state: deserializeState({}), loaded: false};
    }
}

function savePersistedState(state) {
    try {
        writeJsonAtomic(stateFilePath(), serializeState(state));
    } catch (err) {
        logger.warn(`[SubscriptionWatcher] failed to save state file: ${err.message}`);
    }
}

function diffSubscriptionItems(previousMap, currentItems, subscriptionKey) {
    const currentMap = new Map();
    for (const item of currentItems || []) {
        const id = itemId(item);
        if (id) currentMap.set(id, item);
    }

    const added = [];
    const removed = [];
    const updated = [];

    for (const [id, item] of currentMap.entries()) {
        const previous = previousMap ? previousMap.get(id) : null;
        if (!previous) {
            added.push(item);
            continue;
        }
        if (hashSubscriptionItem(previous, subscriptionKey) !== hashSubscriptionItem(item, subscriptionKey)) {
            updated.push({id, before: previous, after: item});
        }
    }

    if (previousMap) {
        for (const [id, item] of previousMap.entries()) {
            if (!currentMap.has(id)) removed.push(item);
        }
    }

    return {currentMap, added, removed, updated};
}

function projectSubscriptionItem(item, subscriptionKey) {
    return {
        ...projectCatalogItem(item),
        subscription: getItemSubscriptionInfo(item, subscriptionKey)
    };
}

function projectSubscriptionItems(items, subscriptionKey) {
    return (items || []).map(item => projectSubscriptionItem(item, subscriptionKey));
}

function projectRemovedSubscriptionItems(items, subscriptionKey) {
    return projectSubscriptionItems(items, subscriptionKey);
}

function projectUpdatedSubscriptionItems(items, subscriptionKey) {
    return (items || []).map(item => ({
        id: item.id,
        before: item.before ? projectSubscriptionItem(item.before, subscriptionKey) : null,
        after: item.after ? projectSubscriptionItem(item.after, subscriptionKey) : null
    }));
}

class SubscriptionWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.state = deserializeState({});
        this.bootstrapped = false;
        this.suppressInitialChanges = true;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;

        const intervalMs = Math.max(10000, parseInt(process.env.SUBSCRIPTION_WATCH_INTERVAL_MS || "300000", 10));

        const run = async () => {
            const alias = getAlias();

            if (!this.bootstrapped) {
                const persisted = loadPersistedState();
                this.state = persisted.state;
                this.bootstrapped = true;
                this.suppressInitialChanges = !persisted.loaded;
            }

            for (const key of Object.keys(SUBSCRIPTION_DEFS)) {
                const def = SUBSCRIPTION_DEFS[key];
                const items = await marketplaceService.fetchSubscriptionItems(alias, key, {});
                const previous = this.state[key] || new Map();
                const {currentMap, added, removed, updated} = diffSubscriptionItems(previous, items, key);
                this.state[key] = currentMap;

                eventBus.emit(subscriptionEventName(key, "snapshot"), {
                    ts: Date.now(),
                    subscription: {key: def.key, label: def.label, tag: def.tag},
                    count: items.length,
                    items: projectSubscriptionItems(items, key)
                });

                if (added.length && !this.suppressInitialChanges) {
                    eventBus.emit(subscriptionEventName(key, "added"), {
                        ts: Date.now(),
                        subscription: {key: def.key, label: def.label, tag: def.tag},
                        count: added.length,
                        items: projectSubscriptionItems(added, key)
                    });
                }

                if (removed.length && !this.suppressInitialChanges) {
                    eventBus.emit(subscriptionEventName(key, "removed"), {
                        ts: Date.now(),
                        subscription: {key: def.key, label: def.label, tag: def.tag},
                        count: removed.length,
                        items: projectRemovedSubscriptionItems(removed, key)
                    });
                }

                if (updated.length && !this.suppressInitialChanges) {
                    eventBus.emit(subscriptionEventName(key, "updated"), {
                        ts: Date.now(),
                        subscription: {key: def.key, label: def.label, tag: def.tag},
                        count: updated.length,
                        items: projectUpdatedSubscriptionItems(updated, key)
                    });
                }
            }

            savePersistedState(this.state);
            this.suppressInitialChanges = false;
        };

        run().catch(err => {
            logger.error(`[SubscriptionWatcher] initial run failed: ${err.stack || err.message}`);
        });
        this.timer = setInterval(() => run().catch(err => {
            logger.error(`[SubscriptionWatcher] scheduled run failed: ${err.stack || err.message}`);
        }), intervalMs);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const subscriptionWatcher = new SubscriptionWatcher();

module.exports = {
    subscriptionWatcher,
    _internals: {
        deserializeState,
        diffSubscriptionItems,
        hashSubscriptionItem,
        projectRemovedSubscriptionItems,
        projectSubscriptionItems,
        projectUpdatedSubscriptionItems,
        serializeState
    }
};
