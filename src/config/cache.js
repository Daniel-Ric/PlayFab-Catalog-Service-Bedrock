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
const {AsyncLocalStorage} = require("node:async_hooks");

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000);
const DATA_TTL_MS = Number(process.env.DATA_TTL_MS || 5 * 60 * 1000);

function createCache({max, ttl}) {
    const metrics = {hits: 0, misses: 0, inflightHits: 0, sets: 0};
    const cache = new LRUCache({
        max,
        ttl,
        ttlAutopurge: true,
        allowStale: false,
        updateAgeOnGet: false,
        updateAgeOnHas: false
    });
    const inflight = new Map();
    const dependencies = new AsyncLocalStorage();
    const derived = new LRUCache({max: 32, ttl});
    const derivedInflight = new Map();

    function remember(key, value) {
        if (typeof value !== "undefined") dependencies.getStore()?.set(key, value);
        return value;
    }

    function failed(error) {
        dependencies.getStore()?.set(Symbol(), null);
        throw error;
    }

    async function getOrSetDerivedAsync(key, fn, accept = () => true) {
        let result = derived.get(key);
        const previous = result?.dependencies.length && result.dependencies.every(([source, value]) => cache.get(source) === value) ? result : null;
        if (!previous || !accept(previous.value)) {
            derived.delete(key);
            let pending = derivedInflight.get(key);
            if (!pending) {
                pending = (async () => {
                    const sources = new Map();
                    const value = await dependencies.run(sources, () => {
                        for (const [source, value] of previous?.dependencies || []) remember(source, value);
                        return fn(previous?.value);
                    });
                    const entry = {value, dependencies: [...sources]};
                    derived.set(key, entry);
                    return entry;
                })().finally(() => derivedInflight.delete(key));
                derivedInflight.set(key, pending);
            }
            result = await pending;
            if (!accept(result.value)) return getOrSetDerivedAsync(key, fn, accept);
        }
        for (const [source, value] of result.dependencies) remember(source, value);
        return result.value;
    }

    async function getOrSetAsync(key, fn, ttlOverride) {
        if (cache.has(key)) {
            metrics.hits += 1;
            return remember(key, cache.get(key));
        }
        metrics.misses += 1;
        if (inflight.has(key)) {
            metrics.inflightHits += 1;
            return inflight.get(key).then(value => remember(key, value), failed);
        }
        const p = Promise.resolve().then(fn).then(val => {
            cache.set(key, val, {ttl: ttlOverride ?? ttl});
            metrics.sets += 1;
            inflight.delete(key);
            return val;
        }).catch(err => {
            inflight.delete(key);
            throw err;
        });
        inflight.set(key, p);
        return p.then(value => remember(key, value), failed);
    }

    return {
        get: k => {
            const value = cache.get(k);
            if (typeof value === "undefined") metrics.misses += 1; else metrics.hits += 1;
            return remember(k, value);
        },
        set: (k, v, opts = {}) => {
            metrics.sets += 1;
            return cache.set(k, v, {ttl: opts.ttl ?? ttl});
        },
        has: k => cache.has(k),
        delete: k => cache.delete(k),
        clear: () => {
            cache.clear();
            derived.clear();
        },
        get size() {
            return cache.size;
        },
        get inflightSize() {
            return inflight.size;
        },
        get metrics() {
            const lookups = metrics.hits + metrics.misses;
            return {
                ...metrics,
                lookups,
                hitRate: lookups > 0 ? Number((metrics.hits / lookups).toFixed(4)) : 0
            };
        },
        getOrSetAsync,
        getOrSetDerivedAsync
    };
}

const sessionCache = createCache({max: Number(process.env.SESSION_CACHE_MAX || 1000), ttl: SESSION_TTL_MS});
const dataCache = createCache({max: Number(process.env.DATA_CACHE_MAX || 20000), ttl: DATA_TTL_MS});

module.exports = {sessionCache, dataCache};
module.exports._internals = {createCache};
