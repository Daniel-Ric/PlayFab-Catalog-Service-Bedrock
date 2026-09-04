// -----------------------------------------------------------------------------
//
// File: test/cacheMetrics.test.js
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

const test = require("node:test");
const assert = require("node:assert/strict");
const {_internals} = require("../src/config/cache");

test("cache reports hits, misses, sets, and hit rate", async () => {
    const cache = _internals.createCache({max: 10, ttl: 1000});
    assert.equal(await cache.getOrSetAsync("key", async () => "value"), "value");
    assert.equal(await cache.getOrSetAsync("key", async () => "other"), "value");
    assert.equal(cache.get("missing"), undefined);

    assert.deepEqual(cache.metrics, {
        hits: 1,
        misses: 2,
        inflightHits: 0,
        sets: 1,
        lookups: 3,
        hitRate: 0.3333
    });
});

test("cache counts in-flight request deduplication", async () => {
    const cache = _internals.createCache({max: 10, ttl: 1000});
    let release;
    const value = new Promise(resolve => {
        release = resolve;
    });
    const first = cache.getOrSetAsync("key", () => value);
    const second = cache.getOrSetAsync("key", () => "other");
    release("value");

    assert.equal(await first, "value");
    assert.equal(await second, "value");
    assert.equal(cache.metrics.inflightHits, 1);
});
