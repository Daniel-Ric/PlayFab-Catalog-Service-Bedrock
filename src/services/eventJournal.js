const path = require('node:path');
const fs = require('node:fs');
const {Worker} = require('node:worker_threads');
const {randomUUID} = require('node:crypto');
const {sanitizeCatalogItem} = require('../utils/catalogSanitizer');
const {writeJsonAtomic, readJson} = require('../utils/storage');
const logger = require('../config/logger');
const {mergeJournalRecords} = require('../utils/journalRecords');

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
        let records = this.file ? readJson(this.file, []) : [];
        if (!Array.isArray(records)) throw new Error('Invalid SSE event journal; restore the data volume.');
        if (this.file && fs.existsSync(`${this.file}.jsonl`)) {
            const raw = fs.readFileSync(`${this.file}.jsonl`);
            const end = raw.lastIndexOf(10) + 1;
            if (end < raw.length) fs.truncateSync(`${this.file}.jsonl`, end);
            const appended = raw.subarray(0, end).toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
            records = mergeJournalRecords(records, appended);
            this.logBytes = end;
        }
        this.records = records;
        this.sizes = records.map(record => Buffer.byteLength(JSON.stringify(record)));
        this.bytes = 2 + this.sizes.reduce((total, size) => total + size + 1, 0) - (records.length ? 1 : 0);
        this.oldestTime = records.reduce((oldest, record) => Math.min(oldest, record.time), Infinity);
        this.prune();
    }

    append(event, data) {
        this.load();
        const record = {id: `${this.now()}-${randomUUID()}`, time: this.now(), event,
            data: sanitizeCatalogItem(data, {exposeSensitive: false})};
        const serialized = JSON.stringify(record);
        if (this.file) {
            if (!fs.existsSync(this.file)) writeJsonAtomic(this.file, []);
            if (!fs.statSync(this.file).isFile()) throw new Error('Invalid SSE event journal file.');
            const handle = fs.openSync(`${this.file}.jsonl`, 'a');
            const offset = fs.fstatSync(handle).size;
            try {
                fs.writeFileSync(handle, `${serialized}\n`, 'utf8');
                this.logBytes = offset + Buffer.byteLength(serialized) + 1;
            } catch (error) {
                fs.ftruncateSync(handle, offset);
                throw error;
            } finally { fs.closeSync(handle); }
        }
        const size = Buffer.byteLength(serialized);
        this.bytes += size + (this.records.length ? 1 : 0);
        this.records.push(record);
        this.sizes.push(size);
        this.oldestTime = Math.min(this.oldestTime, record.time);
        this.prune();
        if (this.file && this.logBytes >= 1024 * 1024) {
            try { this.compact(); } catch (error) { logger.warn(`[EventJournal] compaction failed: ${error.message}`); }
        }
        return record;
    }

    prune() {
        const cutoff = this.now() - this.maxAgeMs;
        if (this.oldestTime < cutoff) {
            const records = [], sizes = [];
            for (let i = 0; i < this.records.length; i++) {
                if (this.records[i].time < cutoff) continue;
                records.push(this.records[i]);
                sizes.push(this.sizes[i]);
            }
            this.records = records;
            this.sizes = sizes;
            this.bytes = 2 + sizes.reduce((total, value) => total + value + 1, 0) - (records.length ? 1 : 0);
        }
        let start = 0;
        while (this.records.length - start > 1 && this.bytes > this.maxBytes) this.bytes -= this.sizes[start++] + 1;
        if (start) {
            this.records.splice(0, start);
            this.sizes.splice(0, start);
        }
        if (start || this.oldestTime < cutoff) this.oldestTime = this.records.reduce((oldest, entry) => Math.min(oldest, entry.time), Infinity);
    }

    compact() {
        if (this.compacting) return;
        const file = this.file;
        const log = `${file}.jsonl`;
        const offset = this.logBytes;
        const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
        const worker = new Worker(path.join(__dirname, 'eventJournalWorker.js'), {
            workerData: {file, log, offset, temporary, cutoff: this.now() - this.maxAgeMs, maxBytes: this.maxBytes}
        });
        this.compacting = worker;
        const failed = error => {
            if (this.compacting !== worker) return;
            this.compacting = null;
            try { fs.rmSync(temporary, {force: true}); } catch {}
            logger.warn(`[EventJournal] compaction failed: ${error.message}`);
        };
        worker.once('message', () => {
            if (this.file !== file) return failed(new Error('Journal file changed during compaction.'));
            const tailFile = `${log}.${process.pid}.${randomUUID()}.tmp`;
            try {
                const handle = fs.openSync(log, 'r');
                let tail;
                try {
                    tail = Buffer.alloc(fs.fstatSync(handle).size - offset);
                    let read = 0;
                    while (read < tail.length) {
                        const count = fs.readSync(handle, tail, read, tail.length - read, offset + read);
                        if (!count) throw new Error('Incomplete SSE event journal tail.');
                        read += count;
                    }
                } finally { fs.closeSync(handle); }
                fs.renameSync(temporary, file);
                fs.writeFileSync(tailFile, tail);
                fs.renameSync(tailFile, log);
                this.logBytes = tail.length;
                this.compacting = null;
            } catch (error) {
                try { fs.rmSync(tailFile, {force: true}); } catch {}
                failed(error);
            }
        });
        worker.once('error', failed);
        worker.once('exit', code => {
            if (this.compacting === worker) failed(new Error(`Journal compactor exited with code ${code}`));
        });
        worker.unref();
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
