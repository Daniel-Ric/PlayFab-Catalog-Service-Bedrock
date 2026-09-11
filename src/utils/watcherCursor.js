const {readJson, writeJsonAtomic} = require('./storage');

class WatcherCursor {
    constructor(file, env = process.env) {
        this.file = file;
        this.overlapMs = Math.max(60000, Number(env.WATCHER_OVERLAP_MS) || 15 * 60000);
        this.reconcileMs = Math.max(this.overlapMs, Number(env.WATCHER_RECONCILE_LOOKBACK_MS) || 7 * 86400000);
        this.intervalMs = Math.max(60000, Number(env.WATCHER_RECONCILE_INTERVAL_MS) || 6 * 3600000);
        this.state = null;
    }
    window(now, overlap = this.overlapMs) {
        if (!this.state) this.state = readJson(this.file, {lastRunTs: 0, lastReconcileTs: 0});
        const reconcile = !this.state.lastReconcileTs || now - this.state.lastReconcileTs >= this.intervalMs;
        return {since: Math.max(0, Math.min(this.state.lastRunTs || now, now) - Math.max(overlap, reconcile ? this.reconcileMs : 0)), reconcile};
    }
    commit(now, window) {
        const next = {lastRunTs: now, lastReconcileTs: window.reconcile ? now : this.state.lastReconcileTs};
        writeJsonAtomic(this.file, next);
        this.state = next;
    }
}
module.exports = {WatcherCursor};
