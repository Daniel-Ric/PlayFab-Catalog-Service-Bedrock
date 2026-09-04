// -----------------------------------------------------------------------------
//
// File: test/catalogPagination.test.js
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
const {resolveCatalogBatchLimit, _internals} = require("../src/utils/playfab");

test("catalog pagination covers the complete upstream total by default", () => {
    assert.equal(resolveCatalogBatchLimit(42601, 300, 0), 143);
    assert.equal(resolveCatalogBatchLimit(42601, 300, undefined), 143);
});

test("catalog pagination only truncates when an explicit cap is configured", () => {
    assert.equal(resolveCatalogBatchLimit(42601, 300, 20), 20);
    assert.equal(resolveCatalogBatchLimit(600, 300, 20), 2);
});

test("catalog pagination remains bounded when upstream omits its total", () => {
    assert.equal(resolveCatalogBatchLimit(null, 300, 12), 12);
    assert.ok(resolveCatalogBatchLimit(null, 300, 0) >= 143);
});

test("catalog split boundaries use raw dates even when boundary items are not transformable", () => {
    const bounds = _internals.catalogDateBounds(
        [{Id: "legacy", CreationDate: "2017-01-01T00:00:00Z"}],
        [{Id: "current", CreationDate: "2026-01-01T00:00:00Z"}],
        "CreationDate"
    );

    assert.deepEqual(bounds, {
        oldestMs: Date.parse("2017-01-01T00:00:00Z"),
        newestMs: Date.parse("2026-01-01T00:00:00Z")
    });
});

test("Catalog V2 fallback normalizes legacy date field casing", () => {
    assert.equal(
        _internals.catalogV2Expression("CreationDate ge 2020-01-01T00:00:00Z and LastModifiedDate le 2026-01-01T00:00:00Z"),
        "creationDate ge 2020-01-01T00:00:00Z and lastModifiedDate le 2026-01-01T00:00:00Z"
    );
    assert.equal(_internals.catalogV2Expression("rating/totalcount desc, StartDate desc"), "rating/totalCount desc, startDate desc");
});

test("catalog scans recognize retryable legacy Search failures", () => {
    assert.equal(_internals.isTransientCatalogSearchError({status: 503}), true);
    assert.equal(_internals.isTransientCatalogSearchError({response: {status: 429}}), true);
    assert.equal(_internals.isTransientCatalogSearchError({code: "PLAYFAB_CIRCUIT_OPEN"}), true);
    assert.equal(_internals.isTransientCatalogSearchError({status: 400}), false);
});
