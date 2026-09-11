const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {sanitizeCatalogItem} = require('../utils/catalogSanitizer');
const {writeJsonAtomic, readJson} = require('../utils/storage');

class EventJournal {
    constructor({file = path.join(__dirname, '../data/events.json'), maxAgeMs = 7 * 86400000,
        maxBytes = 128 * 1024 * 1024, now = Date.now} = {}) {
        this.file = file;
        this.maxAgeMs = maxAgeMs;
        this.maxBytes = maxBytes;
        this.now = now;
        this.records = null;
    }

    load() {
        if (this.records) return;
        const records = this.file ? readJson(this.file, []) : [];
        if (!Array.isArray(records)) throw new Error('Invalid SSE event journal; restore the data volume.');
        this.records = records;
    }

    append(event, data) {
        this.load();
        const record = {id: `${this.now()}-${randomUUID()}`, time: this.now(), event,
            data: sanitizeCatalogItem(data, {exposeSensitive: false})};
        const next = [...this.records, record].filter(r => r.time >= this.now() - this.maxAgeMs);
        let bytes = Buffer.byteLength(JSON.stringify(next));
        while (next.length > 1 && bytes > this.maxBytes) bytes -= Buffer.byteLength(JSON.stringify(next.shift())) + 1;
        if (this.file) writeJsonAtomic(this.file, next);
        this.records = next;
        return record;
    }

    replay(cursor) {
        this.load();
        const latestId = this.records.at(-1)?.id || '0';
        if (!cursor) return {records: [], latestId, gap: false};
        const index = this.records.findIndex(r => r.id === cursor);
        const gap = cursor !== '0' && index < 0;
        const records = this.records.slice(index + 1).filter(r => r.time >= this.now() - this.maxAgeMs);
        return {records, latestId, gap};
    }
}

module.exports = {EventJournal};
