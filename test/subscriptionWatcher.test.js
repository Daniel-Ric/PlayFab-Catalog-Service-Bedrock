// -----------------------------------------------------------------------------
//
// File: test/subscriptionWatcher.test.js
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
const {_internals} = require("../src/services/subscriptionWatcher");
const {
    getItemSubscriptionInfo,
    getSubscriptionIds,
    subscriptionEventName,
    subscriptionFilter
} = require("../src/utils/marketplaceSubscriptions");

function makeItem(id, tags = []) {
    return {
        Id: id,
        Title: {NEUTRAL: id},
        Tags: tags,
        DisplayProperties: {
            csbStartDate: "2026-05-05T17:00:00Z",
            csbEndDate: "2026-11-03T18:00:00Z",
            realmsPlusStartDate: "2026-06-01T17:00:00Z",
            realmsPlusEndDate: "2026-12-01T18:00:00Z"
        }
    };
}

test("subscriptionFilter maps dedicated subscription tags", () => {
    assert.equal(subscriptionFilter("marketplacePass"), "tags/any(t:t eq 'csb')");
    assert.equal(subscriptionFilter("realmsPlus"), "tags/any(t:t eq 'realms_plus')");
});

test("subscriptionEventName returns dedicated event names", () => {
    assert.equal(subscriptionEventName("marketplacePass", "added"), "marketplace.pass.added");
    assert.equal(subscriptionEventName("realmsPlus", "removed"), "realms.plus.removed");
});

test("getItemSubscriptionInfo reads tags and date windows", () => {
    const item = makeItem("one", ["csb", "realms_plus"]);

    const pass = getItemSubscriptionInfo(item, "marketplacePass");
    const realms = getItemSubscriptionInfo(item, "realmsPlus");

    assert.equal(pass.active, true);
    assert.equal(pass.startDate, "2026-05-05T17:00:00.000Z");
    assert.equal(pass.endDate, "2026-11-03T18:00:00.000Z");
    assert.equal(realms.active, true);
    assert.equal(realms.startDate, "2026-06-01T17:00:00.000Z");
    assert.equal(realms.endDate, "2026-12-01T18:00:00.000Z");
});

test("getSubscriptionIds separates Marketplace Pass and Realms Plus memberships", () => {
    const ids = getSubscriptionIds([
        makeItem("pass-only", ["csb"]),
        makeItem("realms-only", ["realms_plus"]),
        makeItem("both", ["csb", "realms_plus"])
    ]);

    assert.deepEqual(Array.from(ids.marketplacePass).sort(), ["both", "pass-only"]);
    assert.deepEqual(Array.from(ids.realmsPlus).sort(), ["both", "realms-only"]);
});

test("diffSubscriptionItems returns added and removed items", () => {
    const previous = new Map([
        ["old", makeItem("old", ["csb"])],
        ["same", makeItem("same", ["csb"])]
    ]);
    const current = [
        makeItem("same", ["csb"]),
        makeItem("new", ["csb"])
    ];

    const result = _internals.diffSubscriptionItems(previous, current);

    assert.deepEqual(result.added.map(item => item.Id), ["new"]);
    assert.deepEqual(result.removed.map(item => item.Id), ["old"]);
    assert.deepEqual(Array.from(result.currentMap.keys()).sort(), ["new", "same"]);
});

test("subscription watcher state serializes and restores item maps", () => {
    const state = {
        marketplacePass: new Map([["one", makeItem("one", ["csb"])]]),
        realmsPlus: new Map([["two", makeItem("two", ["realms_plus"])]])
    };

    const restored = _internals.deserializeState(_internals.serializeState(state));

    assert.equal(restored.marketplacePass.get("one").Id, "one");
    assert.equal(restored.realmsPlus.get("two").Id, "two");
});
