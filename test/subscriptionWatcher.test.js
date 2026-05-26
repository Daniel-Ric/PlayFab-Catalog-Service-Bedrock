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
const {EVENT_NAME_SET} = require("../src/config/eventNames");
const {
    getItemSubscriptionInfo,
    getSubscriptionIds,
    subscriptionEventName,
    subscriptionFilter
} = require("../src/utils/marketplaceSubscriptions");

function makeItem(id, tags = [], overrides = {}) {
    const base = {
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
    return {
        ...base,
        ...overrides,
        DisplayProperties: {
            ...base.DisplayProperties,
            ...(overrides.DisplayProperties || {})
        }
    };
}

test("subscriptionFilter maps dedicated subscription tags", () => {
    assert.equal(subscriptionFilter("marketplacePass"), "tags/any(t:t eq 'csb')");
    assert.equal(subscriptionFilter("realmsPlus"), "tags/any(t:t eq 'realms_plus')");
});

test("subscriptionEventName returns dedicated event names", () => {
    assert.equal(subscriptionEventName("marketplacePass", "added"), "marketplace.pass.added");
    assert.equal(subscriptionEventName("marketplacePass", "updated"), "marketplace.pass.updated");
    assert.equal(subscriptionEventName("realmsPlus", "removed"), "realms.plus.removed");
    assert.equal(subscriptionEventName("realmsPlus", "updated"), "realms.plus.updated");
    assert.ok(EVENT_NAME_SET.has("marketplace.pass.updated"));
    assert.ok(EVENT_NAME_SET.has("realms.plus.updated"));
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

test("getItemSubscriptionInfo supports normalized lower-case payload fields", () => {
    const item = {
        id: "one",
        tags: ["CSB"],
        displayProperties: {
            csbStartDate: "2026-05-05T17:00:00Z",
            csbEndDate: "2026-11-03T18:00:00Z"
        }
    };

    const pass = getItemSubscriptionInfo(item, "marketplacePass");

    assert.equal(pass.active, true);
    assert.equal(pass.startDate, "2026-05-05T17:00:00.000Z");
    assert.equal(pass.endDate, "2026-11-03T18:00:00.000Z");
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

    const result = _internals.diffSubscriptionItems(previous, current, "marketplacePass");

    assert.deepEqual(result.added.map(item => item.Id), ["new"]);
    assert.deepEqual(result.removed.map(item => item.Id), ["old"]);
    assert.deepEqual(result.updated, []);
    assert.deepEqual(Array.from(result.currentMap.keys()).sort(), ["new", "same"]);
});

test("diffSubscriptionItems returns updated items for changed memberships", () => {
    const previousItem = makeItem("same", ["csb"], {
        DisplayProperties: {
            csbEndDate: "2026-11-03T18:00:00Z",
            creatorName: "Before Creator"
        }
    });
    const currentItem = makeItem("same", ["csb"], {
        DisplayProperties: {
            csbEndDate: "2026-12-03T18:00:00Z",
            creatorName: "After Creator"
        }
    });
    const previous = new Map([["same", previousItem]]);

    const result = _internals.diffSubscriptionItems(previous, [currentItem], "marketplacePass");

    assert.deepEqual(result.added, []);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.updated.map(item => item.id), ["same"]);
    assert.equal(result.updated[0].before.DisplayProperties.csbEndDate, "2026-11-03T18:00:00Z");
    assert.equal(result.updated[0].after.DisplayProperties.csbEndDate, "2026-12-03T18:00:00Z");
});

test("projectUpdatedSubscriptionItems includes before and after subscription windows", () => {
    const before = makeItem("same", ["csb"], {
        DisplayProperties: {csbEndDate: "2026-11-03T18:00:00Z"}
    });
    const after = makeItem("same", ["csb"], {
        DisplayProperties: {csbEndDate: "2026-12-03T18:00:00Z"}
    });

    const projected = _internals.projectUpdatedSubscriptionItems([{id: "same", before, after}], "marketplacePass");

    assert.equal(projected[0].id, "same");
    assert.equal(projected[0].before.subscription.endDate, "2026-11-03T18:00:00.000Z");
    assert.equal(projected[0].after.subscription.endDate, "2026-12-03T18:00:00.000Z");
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
