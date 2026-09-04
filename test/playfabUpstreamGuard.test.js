// -----------------------------------------------------------------------------
//
// File: test/playfabUpstreamGuard.test.js
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
const {createUpstreamGuard, endpointPolicy, resolvePriority} = require("../src/services/playfabUpstreamGuard");

test("SearchItems receives the documented default request budget", () => {
    assert.deepEqual(endpointPolicy("Catalog/SearchItems", {}), {maxConcurrent: 1, minTime: 600});
    assert.deepEqual(endpointPolicy("Catalog/GetItems", {}), {maxConcurrent: 4, minTime: 50});
    assert.equal(resolvePriority("interactive") < resolvePriority("background"), true);
});

test("circuit opens after repeated throttling and recovers through one probe", async () => {
    let now = 0;
    const guard = createUpstreamGuard({
        threshold: 2,
        openMs: 1000,
        now: () => now,
        policyResolver: () => ({maxConcurrent: 1, minTime: 0})
    });

    await guard.schedule("title", "Catalog/SearchItems", async () => ({status: 429}));
    await guard.schedule("title", "Catalog/SearchItems", async () => ({status: 503}));
    await assert.rejects(
        () => guard.schedule("title", "Catalog/SearchItems", async () => ({status: 200})),
        {code: "PLAYFAB_CIRCUIT_OPEN", status: 503}
    );

    let snapshot = guard.snapshot();
    assert.equal(snapshot.totals.throttled, 2);
    assert.equal(snapshot.totals.circuitRejected, 1);
    assert.equal(snapshot.totals.openCircuits, 1);

    now = 1001;
    const response = await guard.schedule("title", "Catalog/SearchItems", async () => ({status: 200}));
    assert.equal(response.status, 200);
    snapshot = guard.snapshot();
    assert.equal(snapshot.totals.openCircuits, 0);
    assert.equal(snapshot.endpoints[0].circuit.consecutiveFailures, 0);
});
