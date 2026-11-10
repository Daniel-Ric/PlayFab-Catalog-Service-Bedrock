// -----------------------------------------------------------------------------
//
// File: src/services/eventJournalWorker.js
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

const fs = require('node:fs');
const {parentPort, workerData} = require('node:worker_threads');
const {mergeJournalRecords} = require('../utils/journalRecords');

const {file, log, offset, temporary, cutoff, maxBytes} = workerData;
const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
const handle = fs.openSync(log, 'r');
const buffer = Buffer.alloc(offset);
try {
    let read = 0;
    while (read < offset) {
        const count = fs.readSync(handle, buffer, read, offset - read, read);
        if (!count) throw new Error('Incomplete SSE event journal.');
        read += count;
    }
} finally { fs.closeSync(handle); }
const appended = buffer.toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const records = mergeJournalRecords(snapshot, appended);
const retained = records.filter(record => record.time >= cutoff).map(record => JSON.stringify(record));
let bytes = 2 + retained.reduce((total, record) => total + Buffer.byteLength(record) + 1, 0) - (retained.length ? 1 : 0);
let start = 0;
while (retained.length - start > 1 && bytes > maxBytes) bytes -= Buffer.byteLength(retained[start++]) + 1;
fs.writeFileSync(temporary, `[${retained.slice(start).join(',')}]`, 'utf8');
parentPort.postMessage('ready');
