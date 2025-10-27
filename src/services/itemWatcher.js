const {sendPlayFabRequest, buildSearchPayload, isValidItem} = require("../utils/playfab");
const {resolveTitle} = require("../utils/titles");
const {stableHash} = require("../utils/hash");
const {projectCatalogItems, projectCatalogItem} = require("../utils/projectors");

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
        LastModifiedDate: it.LastModifiedDate
    };
    return stableHash(core);
}

async function fetchRecentItems(titleId, os, top, pages) {
    const out = [];
    const orderBy = "creationDate desc";
    const search = "";
    const filter = "";
    for (let i = 0; i < pages; i++) {
        const skip = i * top;
        const payload = buildSearchPayload({filter, search, top, skip, orderBy, expandFields: "images"});
        const data = await sendPlayFabRequest(titleId, "Catalog/Search", payload, "X-EntityToken", 2, os);
        const items = (data.Items || []).filter(isValidItem);
        if (!items.length) break;
        out.push(...items);
        if (items.length < top) break;
    }
    return out;
}

function diffItems(prevMap, currItems) {
    const nextMap = new Map();
    const created = [];
    const updated = [];
    for (const it of currItems) {
        const id = it.Id || it.id;
        const h = hashItemCore(it);
        nextMap.set(id, {hash: h, raw: it});
        const prev = prevMap.get(id);
        if (!prev) {
            created.push(it);
        } else if (prev.hash !== h) {
            updated.push({before: prev.raw, after: it});
        }
    }
    return {nextMap, created, updated};
}

class ItemWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.state = new Map();
        this.lastRunTs = 0;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;
        const os = process.env.OS || "iOS";
        const intervalMs = Math.max(10000, parseInt(process.env.ITEM_WATCH_INTERVAL_MS || "30000", 10));
        const pageTop = Math.max(50, parseInt(process.env.ITEM_WATCH_TOP || "150", 10));
        const pages = Math.max(1, parseInt(process.env.ITEM_WATCH_PAGES || "3", 10));
        const run = async () => {
            const titleId = getTitleId();
            const recent = await fetchRecentItems(titleId, os, pageTop, pages);
            if (this.state.size === 0) {
                const bootstrapMap = new Map();
                for (const it of recent) {
                    const id = it.Id || it.id;
                    bootstrapMap.set(id, {hash: hashItemCore(it), raw: it});
                }
                this.state = bootstrapMap;
                this.lastRunTs = Date.now();
                const snapshotPayload = {
                    ts: Date.now(), count: bootstrapMap.size, items: projectCatalogItems(recent)
                };
                eventBus.emit("item.snapshot", snapshotPayload);
                return;
            }
            const {nextMap, created, updated} = diffItems(this.state, recent);
            if (created.length > 0) {
                const createdPayload = {
                    ts: Date.now(), count: created.length, items: projectCatalogItems(created)
                };
                eventBus.emit("item.created", createdPayload);
            }
            if (updated.length > 0) {
                const updatedPayload = {
                    ts: Date.now(), count: updated.length, items: updated.map(pair => ({
                        before: projectCatalogItem(pair.before), after: projectCatalogItem(pair.after)
                    }))
                };
                eventBus.emit("item.updated", updatedPayload);
            }
            this.state = nextMap;
            this.lastRunTs = Date.now();
        };
        run().catch(() => {
        });
        this.timer = setInterval(() => run().catch(() => {
        }), intervalMs);
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
