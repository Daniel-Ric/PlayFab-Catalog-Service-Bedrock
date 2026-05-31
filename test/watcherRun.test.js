// -----------------------------------------------------------------------------
//
// File: test/watcherRun.test.js
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
const {createNonOverlappingRunner} = require("../src/utils/watcherRun");

test("non-overlapping watcher runner skips a tick while a run is active", async () => {
    let release;
    let runCount = 0;
    let skipCount = 0;

    const runner = createNonOverlappingRunner({
        run: async () => {
            runCount += 1;
            if (runCount > 1) return;
            await new Promise(resolve => {
                release = resolve;
            });
        },
        onSkip: () => {
            skipCount += 1;
        },
        skipLogIntervalMs: 0
    });

    const firstRun = runner();
    const skipped = await runner();

    assert.equal(skipped, false);
    assert.equal(runCount, 1);
    assert.equal(skipCount, 1);

    release();
    assert.equal(await firstRun, true);
    assert.equal(await runner(), true);
    assert.equal(runCount, 2);
});

test("non-overlapping watcher runner resets after handled errors", async () => {
    let runCount = 0;
    let errorMessage = null;

    const runner = createNonOverlappingRunner({
        run: async () => {
            runCount += 1;
            if (runCount === 1) throw new Error("boom");
        },
        onError: err => {
            errorMessage = err.message;
        }
    });

    assert.equal(await runner(), false);
    assert.equal(errorMessage, "boom");
    assert.equal(await runner(), true);
    assert.equal(runCount, 2);
});
