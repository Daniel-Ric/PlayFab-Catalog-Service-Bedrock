const fs = require("fs");
const path = require("path");
const {sendPlayFabRequest, isValidItem, getItemsByIds} = require("./utils/playfab");
const {resolveTitle} = require("./utils/titles");
const {stableHash} = require("./utils/hash");
const {projectCatalogItems, projectCatalogItem} = require("./utils/projectors");

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

function idOfSearchHit(hit) {
    if (!hit) return null;
    return hit.Id || hit.id || hit.Item?.Id || hit.Item?.id || hit.ItemId || hit.itemId || null;
}

async function searchItemsPage(titleId, os, filter, orderBy, continuationToken, count) {
    const payload = {
        Filter: filter, OrderBy: orderBy, ContinuationToken: continuationToken, Count: count
    };
    const data = await sendPlayFabRequest(titleId, "Catalog/SearchItems", payload, "X-EntityToken", 3, os);
    return data || {};
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
    if (!hits.length) return {items: [], continuationToken: nextToken};

    const ids = hits.map(idOfSearchHit).filter(Boolean);
    let full = [];
    try {
        full = await getItemsCompat(titleId, os, ids);
    } catch {
        full = [];
    }

    const items = (full && full.length) ? full : hits;
    return {items: (items || []).filter(isValidItem), continuationToken: nextToken};
}

async function fetchRecentItems(titleId, os, itemsPerRequest, maxItems) {
    const field = "LastModifiedDate";
    const orderBy = `${field} desc`;
    const filter = "";

    const allItems = [];
    let continuationToken = null;

    while (true) {
        const page = await requestItems(titleId, os, filter, orderBy, continuationToken, itemsPerRequest);

        const pageItems = page.items || [];
        if (!pageItems.length) break;

        allItems.push(...pageItems);
        if (allItems.length >= maxItems) break;

        continuationToken = page.continuationToken || null;
        if (!continuationToken) break;
    }

    return allItems.slice(0, maxItems);
}

async function fetchItemsSince(titleId, os, field, sinceIso, itemsPerRequest, maxItems) {
    const filter = `(${field} ge ${sinceIso})`;
    const orderBy = `${field} asc`;
    const allItems = [];
    let continuationToken = null;

    while (allItems.length < maxItems) {
        const remaining = maxItems - allItems.length;
        const count = Math.min(itemsPerRequest, remaining);
        const page = await requestItems(titleId, os, filter, orderBy, continuationToken, count);

        const pageItems = page.items || [];
        if (!pageItems.length) break;

        allItems.push(...pageItems);
        if (pageItems.length < count) break;

        continuationToken = page.continuationToken || null;
        if (!continuationToken) break;
    }

    return allItems;
}

async function requestChangedItems(titleId, os, instantSinceIso, itemsPerRequest, maxItems) {
    const itemMap = new Map();
    const fields = ["CreationDate", "StartDate", "LastModifiedDate"];

    for (const field of fields) {
        const list = await fetchItemsSince(titleId, os, field, instantSinceIso, itemsPerRequest, maxItems);
        for (const it of list) {
            const id = it.Id || it.id;
            if (!id) continue;
            itemMap.set(id, it);
        }
    }

    return Array.from(itemMap.values());
}

function atomicWriteText(file, text) {
    const dir = path.dirname(file);
    try {
        fs.mkdirSync(dir, {recursive: true});
    } catch {
    }
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, text, "utf8");
    fs.renameSync(tmp, file);
}

function readLastRunTs(file, fallbackTs) {
    try {
        if (!fs.existsSync(file)) return fallbackTs;
        const raw = fs.readFileSync(file, "utf8");
        const n = Number(String(raw || "").trim());
        return Number.isFinite(n) && n > 0 ? n : fallbackTs;
    } catch {
        return fallbackTs;
    }
}

class ItemWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.state = new Map();
        this.bootstrapped = false;
        this.initPromise = null;
    }

    init(eventBus) {
        if (this.bootstrapped) return Promise.resolve();

        if (this.initPromise) return this.initPromise;

        const os = process.env.OS || "iOS";

        const bootstrapItemsPerRequest = Math.max(10, parseInt(process.env.ITEM_WATCH_BOOTSTRAP_ITEMS_PER_REQUEST || process.env.ITEM_WATCH_ITEMS_PER_REQUEST || "200", 10));

        const bootstrapMaxItems = Math.max(bootstrapItemsPerRequest, parseInt(process.env.ITEM_WATCH_BOOTSTRAP_MAX_ITEMS || "600", 10));

        this.initPromise = (async () => {
            const titleId = getTitleId();
            const recent = await fetchRecentItems(titleId, os, bootstrapItemsPerRequest, bootstrapMaxItems);
            const bootstrapMap = new Map();
            for (const it of recent) {
                const id = it.Id || it.id;
                if (!id) continue;
                bootstrapMap.set(id, {hash: hashItemCore(it), raw: it});
            }
            this.state = bootstrapMap;
            this.bootstrapped = true;
            eventBus.emit("item.snapshot", {
                ts: Date.now(), count: recent.length, items: projectCatalogItems(recent)
            });
        })();

        return this.initPromise;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;

        const os = process.env.OS || "iOS";
        const intervalMs = Math.max(10000, parseInt(process.env.ITEM_WATCH_INTERVAL_MS || "60000", 10));

        const itemsPerRequest = Math.max(10, parseInt(process.env.ITEM_WATCH_ITEMS_PER_REQUEST || "200", 10));
        const maxItems = Math.max(itemsPerRequest, parseInt(process.env.ITEM_WATCH_MAX_ITEMS || "10000", 10));

        const lastRunFile = process.env.ITEM_WATCH_LAST_RUN_FILE ? String(process.env.ITEM_WATCH_LAST_RUN_FILE) : path.join(__dirname, "./data/last_run.txt");

        const run = async () => {
            const titleId = getTitleId();

            const fallbackLastRun = Date.now() - intervalMs;
            const lastRunTs = readLastRunTs(lastRunFile, fallbackLastRun);
            const nowTs = Date.now();
            try {
                atomicWriteText(lastRunFile, String(nowTs));
            } catch {
            }

            const sinceIso = new Date(lastRunTs).toISOString();
            const changed = await requestChangedItems(titleId, os, sinceIso, itemsPerRequest, maxItems);
            if (!changed.length) return;

            const created = [];
            const updated = [];

            for (const it of changed) {
                const id = it.Id || it.id;
                if (!id) continue;

                const creationTs = tsOf(creationDateOf(it));
                const startTs = tsOf(startDateOf(it));
                const modTs = tsOf(lastModifiedDateOf(it));

                const isNew = (creationTs && creationTs >= lastRunTs) || (startTs && startTs >= lastRunTs);
                const prev = this.state.get(id) || null;

                if (isNew) {
                    created.push(it);
                } else if ((modTs && modTs >= lastRunTs) || (startTs && startTs >= lastRunTs)) {
                    updated.push({
                        id, before: prev ? prev.raw : null, after: it
                    });
                }

                this.state.set(id, {hash: hashItemCore(it), raw: it});
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
        };

        this.init(eventBus).catch(() => {
        }).finally(() => {
            run().catch(() => {
            });
            this.timer = setInterval(() => run().catch(() => {
            }), intervalMs);
        });
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const itemWatcher = new ItemWatcher();
module.exports = {itemWatcher};
