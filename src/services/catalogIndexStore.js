"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {readJson, writeJsonAtomic} = require("../utils/storage");
const {createScan, scanCatalog} = require("./catalogPartitionScanner");
const {CatalogOfferIndex, projectOffer} = require("./catalogOfferIndex");

class CatalogIndexStore {
    constructor({directory, fetchPage, registry = [], now = Date.now}) {
        this.directory = directory;
        this.fetchPage = fetchPage;
        this.registry = registry;
        this.now = now;
        fs.mkdirSync(directory, {recursive: true});
        this.reload();
    }
    reload() {
        const snapshotPath = path.join(this.directory, "snapshot.json");
        this.snapshotModified = fs.existsSync(snapshotPath) ? fs.statSync(snapshotPath).mtimeMs : 0;
        this.index = new CatalogOfferIndex(readJson(snapshotPath, null), {now: this.now});
        this.readSyncState();
    }
    readSyncState() {
        this.state = ['checkpoint.json', 'incremental-checkpoint.json']
            .map(file => readJson(path.join(this.directory, file), null)).filter(Boolean)
            .sort((a, b) => Date.parse(b.lastAttemptAt || 0) - Date.parse(a.lastAttemptAt || 0))[0] || null;
    }
    coverage() {
        return {...this.index.coverage(), sync: this.state ? {
            id: this.state.id, status: this.state.status, pages: this.state.pages,
            completedPartitions: this.state.completed, pendingPartitions: this.state.pending.length,
            lastError: this.state.error, lastAttemptAt: this.state.lastAttemptAt,
            lastFullScanAt: this.index.snapshot?.lastFullScanAt || null
        } : null};
    }
    refreshReader() {
        if (this.running || Date.now() - (this.lastReadCheck || 0) < 5000) return;
        this.lastReadCheck = Date.now();
        const file = path.join(this.directory, "snapshot.json");
        const modified = fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0;
        if (modified !== this.snapshotModified) { this.reload(); this.snapshotModified = modified; }
        else this.readSyncState();
    }
    query(input = {}) {
        let snapshotId;
        try { snapshotId = JSON.parse(Buffer.from(String(input.cursor || ''), 'base64url').toString()).snapshot; } catch {}
        if (snapshotId && snapshotId !== this.index.snapshot?.id && /^[0-9a-f-]{36}$/.test(snapshotId)) {
            const file = path.join(this.directory, 'snapshots', `${snapshotId}.json`);
            if (fs.existsSync(file) && this.now() - fs.statSync(file).mtimeMs < 120000) {
                if (this.retainedIndex?.snapshot.id !== snapshotId) {
                    this.retainedIndex = new CatalogOfferIndex(readJson(file, null), {now: this.now});
                }
                return this.retainedIndex.query(input);
            }
        }
        return this.index.query(input);
    }
    async sync({incremental = false, maxPages = Infinity, signal} = {}) {
        if (this.running) return this.coverage();
        const lockPath = path.join(this.directory, "writer.lock");
        let lock;
        try {
            lock = fs.openSync(lockPath, "wx");
            fs.writeFileSync(lock, JSON.stringify({pid: process.pid, host: os.hostname()}));
        } catch (error) {
            if (error.code !== "EEXIST") throw error;

            if (require('./catalogLockRecovery').recoverLocalLock(lockPath)) return this.sync({incremental, maxPages, signal});
            this.reload();
            return this.coverage();
        }
        this.running = true;
        try {
            this.reload();
            const previous = this.index.snapshot;
            const checkpointFile = path.join(this.directory, incremental && previous ? 'incremental-checkpoint.json' : 'checkpoint.json');
            let state = readJson(checkpointFile, null);
            if (!state || state.status === "complete") {
                state = createScan({now: this.now(), since: incremental && previous
                    ? new Date(Date.parse(previous.horizon) - 15 * 60000).toISOString() : null});
            }
            this.state = state;
            state.lastAttemptAt = new Date(this.now()).toISOString();
            const pagesDir = path.join(this.directory, state.id);
            fs.mkdirSync(pagesDir, {recursive: true});
            await scanCatalog({state, fetchPage: this.fetchPage, maxPages, signal, commit: async (checkpoint, rows) => {

                if (rows.length) {
                    const sequence = checkpoint.sequence + 1;
                    writeJsonAtomic(path.join(pagesDir, `${sequence}.json`), rows.map(row => ({...projectOffer(row, this.registry), indexObservedAt: this.now()})));
                    checkpoint.sequence = sequence;
                }
                writeJsonAtomic(checkpointFile, checkpoint);
            }});
            if (state.status !== "complete") return this.coverage();
            const offers = new Map((previous?.items || []).map(item => [item.Id, {...item,
                ...(state.since || item.indexObservedAt > Date.parse(state.horizon) ? {} : {archived: true, availability: "not_observed"})}]));
            const observed = new Map();
            for (let sequence = 1; sequence <= state.sequence; sequence++) {
                for (const row of readJson(path.join(pagesDir, `${sequence}.json`), [])) observed.set(row.Id, row);
            }
            for (const [id, row] of observed) {
                const old = offers.get(id);
                if ((old?.indexObservedAt || 0) > (row.indexObservedAt || 0)) continue;
                row.creatorAliases = [...new Set([...(old?.creatorAliases || []), ...row.creatorAliases])];

                const observedAt = old?.ratingObservedAt || this.now();
                const elapsedHours = (this.now() - observedAt) / 3600000;
                const baseline = old?.ratingBaselineCount ?? Number(old?.Rating?.TotalCount || 0);
                row.ratingGrowth = old && elapsedHours >= 1
                    ? Math.max(0, Number(row.Rating?.TotalCount || 0) - baseline) / elapsedHours : old?.ratingGrowth || 0;
                row.ratingObservedAt = elapsedHours >= 1 || !old ? this.now() : observedAt;
                row.ratingBaselineCount = elapsedHours >= 1 || !old ? Number(row.Rating?.TotalCount || 0) : baseline;
                row.ratingGrowthUpdatedAt = elapsedHours >= 1 ? this.now() : old?.ratingGrowthUpdatedAt || null;
                offers.set(id, row);
            }
            const snapshot = {version: 1, id: state.id,
                horizon: previous?.horizon > state.horizon ? previous.horizon : state.horizon, updatedAt: new Date(this.now()).toISOString(),
                lastFullScanAt: state.since ? previous.lastFullScanAt : state.horizon, items: [...offers.values()]};
            const snapshotsDir = path.join(this.directory, 'snapshots');
            fs.mkdirSync(snapshotsDir, {recursive: true});
            if (previous) {
                const retained = path.join(snapshotsDir, `${previous.id}.json`);
                const temporary = `${retained}.${process.pid}.tmp`;
                fs.copyFileSync(path.join(this.directory, 'snapshot.json'), temporary);
                fs.utimesSync(temporary, this.now() / 1000, this.now() / 1000);
                fs.renameSync(temporary, retained);
            }
            writeJsonAtomic(path.join(this.directory, "snapshot.json"), snapshot);
            this.index = new CatalogOfferIndex(snapshot, {now: this.now});
            this.snapshotModified = fs.statSync(path.join(this.directory, 'snapshot.json')).mtimeMs;
            for (const entry of fs.readdirSync(snapshotsDir)) {
                if (!/^[0-9a-f-]{36}\.json$/.test(entry)) continue;
                const file = path.join(snapshotsDir, entry);
                if (this.now() - fs.statSync(file).mtimeMs > 120000) fs.unlinkSync(file);
            }

            const activeScans = new Set([state.id, ...['checkpoint.json', 'incremental-checkpoint.json']
                .map(file => readJson(path.join(this.directory, file), null))
                .filter(scan => scan && scan.status !== 'complete').map(scan => scan.id)]);
            for (const entry of fs.readdirSync(this.directory, {withFileTypes: true})) {
                if (entry.isDirectory() && /^[0-9a-f-]{36}$/.test(entry.name) && !activeScans.has(entry.name)) {
                    fs.rmSync(path.join(this.directory, entry.name), {recursive: true});
                }
            }
            return this.coverage();
        } finally {
            this.running = false;
            fs.closeSync(lock);
            fs.unlinkSync(lockPath);
        }
    }
}

let singleton;
function getCatalogIndexStore() {
    if (!singleton) {
        const {sendPlayFabRequest} = require("../utils/playfab");
        const {resolveTitle} = require("../utils/titles");
        singleton = new CatalogIndexStore({
            directory: path.resolve(process.env.CATALOG_INDEX_DIRECTORY || path.join(__dirname, "../data/catalog-index")),
            registry: require("../utils/creators").loadCreators(),
            fetchPage: payload => sendPlayFabRequest(resolveTitle("prod"), "Catalog/SearchItems", payload, "X-EntityToken", 3, process.env.OS || "iOS", {priority: "background"})
        });
    }
    return singleton;
}
function startCatalogIndexSync(logger) {
    if (process.env.CATALOG_INDEX_SYNC_ENABLED === "false") return;
    const store = getCatalogIndexStore();
    let ticking = false;
    const tick = async () => {
        if (ticking) return;
        ticking = true;
        try {
            store.refreshReader();
            if (store.index.snapshot) await store.sync({incremental: true, maxPages: 20});
            const fullAge = Date.now() - Date.parse(store.index.snapshot?.lastFullScanAt || "1970-01-01");
            if (fullAge >= 24 * 3600000) await store.sync({maxPages: 20});
            if (store.state?.error) logger.warn("Catalog sync incomplete", store.state.error);
        } catch (error) { logger.error(`Catalog index sync: ${error.message}`); }
        finally { ticking = false; }
    };
    void tick();
    const timer = setInterval(tick, 30000);
    timer.unref();
    return timer;
}
module.exports = {CatalogIndexStore, getCatalogIndexStore, startCatalogIndexSync};
