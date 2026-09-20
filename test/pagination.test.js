// -----------------------------------------------------------------------------
//
// File: test/pagination.test.js
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
const withPagination = require("../src/middleware/pagination");

test("withPagination propagates handler errors instead of returning undefined", async () => {
    const err = new Error("boom");
    const wrapped = withPagination(async () => {
        throw err;
    });

    await assert.rejects(
        () => wrapped({query: {}}, {}, () => {}),
        error => error === err
    );
});

test("offset pagination emits migration headers", () => {
    const headers = {};
    withPagination._internals.setOffsetDeprecationHeaders({
        setHeader(name, value) {
            headers[name] = value;
        }
    });

    assert.equal(headers.Deprecation, "true");
    assert.match(headers.Warning, /continuationToken/);
});

test('raw totals never masquerade as visible offer totals; filtered pages still advance', async () => {
    const headers = {};
    const result = await withPagination(async () => ({items: [], total: 793, rawTotal: 793, serverPaginated: true}))(
        {query: {page: 1, pageSize: 100, limit: 100}}, {setHeader: (key, value) => { headers[key] = value; }});
    assert.equal(result.meta.total, null);
    assert.equal(result.meta.rawTotal, 793);
    assert.equal(result.meta.hasNext, true);
    assert.equal(headers['X-Total-Count'], undefined);
});
