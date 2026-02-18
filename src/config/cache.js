// -----------------------------------------------------------------------------
//
// File: src/config/cache.js
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

const {LRUCache} = require("lru-cache");

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000);
const DATA_TTL_MS = Number(process.env.DATA_TTL_MS || 5 * 60 * 1000);

function createCache({max, ttl}) {
    const cache = new LRUCache({max, ttl, allowStale: false, updateAgeOnGet: false, updateAgeOnHas: false});
    const inflight = new Map();

    async function getOrSetAsync(key, fn, ttlOverride) {
        if (cache.has(key)) return cache.get(key);
        if (inflight.has(key)) return inflight.get(key);
        const p = Promise.resolve().then(fn).then(val => {
            cache.set(key, val, {ttl: ttlOverride ?? ttl});
            inflight.delete(key);
            return val;
        }).catch(err => {
            inflight.delete(key);
            throw err;
        });
        inflight.set(key, p);
        return p;
    }

    return {
        get: k => cache.get(k),
        set: (k, v, opts = {}) => cache.set(k, v, {ttl: opts.ttl ?? ttl}),
        has: k => cache.has(k),
        delete: k => cache.delete(k),
        clear: () => cache.clear(),
        getOrSetAsync
    };
}

const sessionCache = createCache({max: Number(process.env.SESSION_CACHE_MAX || 1000), ttl: SESSION_TTL_MS});
const dataCache = createCache({max: Number(process.env.DATA_CACHE_MAX || 20000), ttl: DATA_TTL_MS});

module.exports = {sessionCache, dataCache};
