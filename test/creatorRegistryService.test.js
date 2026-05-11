// -----------------------------------------------------------------------------
//
// File: test/creatorRegistryService.test.js
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
const {extractCreatorsArray, normalizeCreatorName, diffCreators} = require("../src/services/creatorRegistryService");
const {_internals} = require("../src/services/creatorPartnerWatcher");

test("extractCreatorsArray reads creator toggles from store config", () => {
    const creators = extractCreatorsArray({
        result: {
            storeFilters: [{
                filterType: "creator",
                toggles: [
                    {filterName: "4J Studios", filterId: "master_player_account!28D0EC53875E6219"},
                    {filterName: "100Media", filterId: "master_player_account!C815378092EF16AB"},
                    {filterName: "", filterId: "missing-name"}
                ]
            }]
        }
    });

    assert.deepEqual(creators, [
        {creatorName: "100Media", id: "master_player_account!C815378092EF16AB", displayName: "100Media"},
        {creatorName: "4JStudios", id: "master_player_account!28D0EC53875E6219", displayName: "4J Studios"}
    ]);
});

test("normalizeCreatorName supports alnum mode", () => {
    assert.equal(normalizeCreatorName("Cool Studio", "nospace"), "CoolStudio");
    assert.equal(normalizeCreatorName("Cool ✨ Studio", "alnum"), "CoolStudio");
});

test("diffCreators reports added removed and changed partners", () => {
    const previous = [
        {creatorName: "Old", id: "old", displayName: "Old"},
        {creatorName: "Same", id: "same", displayName: "Same"},
        {creatorName: "Renamed", id: "renamed", displayName: "Before"}
    ];
    const current = [
        {creatorName: "New", id: "new", displayName: "New"},
        {creatorName: "Same", id: "same", displayName: "Same"},
        {creatorName: "Renamed", id: "renamed", displayName: "After"}
    ];

    const diff = diffCreators(previous, current);

    assert.deepEqual(diff.added.map(c => c.id), ["new"]);
    assert.deepEqual(diff.removed.map(c => c.id), ["old"]);
    assert.deepEqual(diff.changed.map(c => c.id), ["renamed"]);
});

test("buildCreatorPartnerChangePayload includes partner details", () => {
    const previous = [{creatorName: "Old", id: "old", displayName: "Old"}];
    const current = [{creatorName: "New", id: "new", displayName: "New"}];
    const diff = diffCreators(previous, current);

    const payload = _internals.buildCreatorPartnerChangePayload({titleId: "20CA2", previous, current, diff, ts: 123});

    assert.equal(payload.addedCount, 1);
    assert.equal(payload.removedCount, 1);
    assert.deepEqual(payload.addedPartnerIds, ["new"]);
    assert.deepEqual(payload.removedPartnerIds, ["old"]);
    assert.equal(payload.ts, 123);
});
