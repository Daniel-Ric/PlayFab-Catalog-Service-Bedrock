// -----------------------------------------------------------------------------
//
// File: test/availabilityService.test.js
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
const {getOpenApiSpec} = require("../src/config/swagger");
const {_internals} = require("../src/services/availabilityService");

test("buildAvailability returns safe catalog and store metadata", () => {
    const result = _internals.buildAvailability({
        Id: "item-1",
        Title: {NEUTRAL: "Item", "de-DE": "Artikel"},
        Description: {"en-US": "Description"},
        DisplayProperties: {
            price: 0,
            minClientVersion: "1.21.0",
            csbStartDate: "2026-01-01T00:00:00Z"
        },
        Platforms: ["windows"],
        Tags: ["csb"],
        Contents: [{
            Id: "content-1",
            Type: "resourcebinary",
            Url: "https://cdn.example/private.zip",
            MinClientVersion: "1.21.0",
            Tags: ["optimized"]
        }],
        DeepLinks: [{Platform: "windows", Url: "minecraft://openStore?item=item-1"}]
    }, [{id: "store-1", active: true}], Date.parse("2026-06-01T00:00:00Z"));

    assert.equal(result.itemId, "item-1");
    assert.equal(result.isFree, true);
    assert.equal(result.clientVersions.min, "1.21.0");
    assert.deepEqual(result.languages, ["de-DE", "en-US", "NEUTRAL"]);
    assert.equal(result.subscriptions.find(entry => entry.key === "marketplacePass").active, true);
    assert.equal(JSON.stringify(result).includes("private.zip"), false);
    assert.equal(result.launchLinks[0].url, "minecraft://openStore?item=item-1");
});

test("storeReferences reads store and resolved item prices", () => {
    const direct = _internals.storeReferences({
        ItemReferences: [{Id: "item-1", Price: {Prices: [{Amounts: [{CurrencyId: "MC", Amount: 100}]}]}}]
    }, []);
    const resolved = _internals.storeReferences({}, [{
        Item: {Id: "item-2"},
        Price: {Prices: [{Amounts: [{ItemId: "coin", Amount: 5}]}]}
    }]);

    assert.deepEqual(direct, [{itemId: "item-1", prices: [{currencyId: "MC", amount: 100}]}]);
    assert.deepEqual(resolved, [{itemId: "item-2", prices: [{currencyId: "coin", amount: 5}]}]);
});

test("availability OpenAPI path is registered", () => {
    const spec = getOpenApiSpec();
    assert.ok(spec.paths["/marketplace/availability/{alias}/{itemId}"]);
});
