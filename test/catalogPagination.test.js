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
const {resolveCatalogBatchLimit} = require("../src/utils/playfab");

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
