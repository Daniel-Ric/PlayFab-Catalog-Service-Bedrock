const {sendPlayFabRequest, buildSearchPayload, isValidItem} = require("../utils/playfab");
const {resolveTitle} = require("../utils/titles");
const {stableHash} = require("../utils/hash");

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
        DisplayProperties: it.DisplayProperties
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
            const next = new Map();
            const created = [];
            const updated = [];
            for (const it of recent) {
                const id = it.Id || it.id;
                const h = hashItemCore(it);
                const prev = this.state.get(id);
                next.set(id, h);
                if (!prev) created.push({id, ts: Date.now()}); else if (prev !== h) updated.push({id, ts: Date.now()});
            }
            if (this.state.size === 0) {
                this.state = next;
                this.lastRunTs = Date.now();
                eventBus.emit("item.snapshot", {ts: Date.now(), count: next.size});
                return;
            }
            if (created.length) eventBus.emit("item.created", {ts: Date.now(), items: created});
            if (updated.length) eventBus.emit("item.updated", {ts: Date.now(), items: updated});
            this.state = next;
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
