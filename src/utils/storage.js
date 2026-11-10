// -----------------------------------------------------------------------------
//
// File: src/utils/storage.js
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
const {Worker} = require("node:worker_threads");

let worker;
let sequence = 0;
const pendingWrites = new Map();

function ensureDir(p) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
}

function readJson(p, fallback) {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
}

function writeJsonAtomic(p, obj) {
    ensureDir(p);
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    fs.renameSync(tmp, p);
}

function writeJsonAtomicAsync(p, obj) {
    const entries = Array.isArray(obj) ? obj.length : Object.values(obj || {}).reduce((count, value) => count + (Array.isArray(value) ? value.length : 1), 0);
    if (entries < 256) {
        writeJsonAtomic(p, obj);
        return Promise.resolve();
    }
    if (!worker) {
        const current = new Worker(path.join(__dirname, "storageWorker.js"));
        worker = current;
        current.on("message", ({id, error}) => {
            const pending = pendingWrites.get(id);
            if (!pending) return;
            pendingWrites.delete(id);
            if (error) pending.reject(Object.assign(new Error(error.message), {code: error.code}));
            else pending.resolve();
            if (!pendingWrites.size) current.unref();
        });
        const fail = error => {
            if (worker !== current) return;
            worker = null;
            for (const pending of pendingWrites.values()) pending.reject(error);
            pendingWrites.clear();
        };
        current.on("error", fail);
        current.on("exit", code => fail(new Error(`Storage worker exited with code ${code}`)));
    }
    return new Promise((resolve, reject) => {
        const id = ++sequence;
        pendingWrites.set(id, {resolve, reject});
        worker.ref();
        try {
            worker.postMessage({id, file: path.resolve(p), value: obj});
        } catch (error) {
            pendingWrites.delete(id);
            if (!pendingWrites.size) worker.unref();
            reject(error);
        }
    });
}

module.exports = {readJson, writeJsonAtomic, writeJsonAtomicAsync};
