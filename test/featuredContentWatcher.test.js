// -----------------------------------------------------------------------------
//
// File: test/featuredContentWatcher.test.js
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
const {_internals} = require("../src/services/featuredContentWatcher");

function layoutItem(id, title) {
    return {id, title, creatorName: `${title} Creator`};
}

function featuredPayload(items) {
    return {
        result: {
            id: "layout-id",
            pageId: "DressingRoom_PersonaProfile",
            pageName: "Home L1",
            rows: [
                {
                    controlId: "StoreRow",
                    telemetryId: "dr.header.featured",
                    components: [
                        {type: "headerComp", text: {value: "dr.header.featured"}},
                        {
                            type: "itemListComp",
                            $type: "ItemListComponent",
                            totalItems: items.length,
                            linksTo: "DressingRoom_PersonaProfile%7cDressingRoom_10000000-2000-3000-4000-500000000000",
                            items
                        }
                    ]
                }
            ]
        }
    };
}

test("collectFeaturedItems finds items inside featured-content result rows", () => {
    const payload = featuredPayload([layoutItem("one", "One"), layoutItem("two", "Two")]);

    const items = _internals.collectFeaturedItems(payload);

    assert.deepEqual(items.map(item => item.id), ["one", "two"]);
});

test("collectFeaturedItemEntries includes row and component context", () => {
    const [entry] = _internals.collectFeaturedItemEntries(featuredPayload([layoutItem("one", "One")]));

    assert.equal(entry.id, "one");
    assert.equal(entry.page.pageId, "DressingRoom_PersonaProfile");
    assert.equal(entry.row.controlId, "StoreRow");
    assert.equal(entry.row.telemetryId, "dr.header.featured");
    assert.equal(entry.row.header, "dr.header.featured");
    assert.equal(entry.component.type, "itemListComp");
    assert.equal(entry.itemIndex, 0);
});

test("buildFeaturedContentChangePayload includes added and removed endpoint item details", () => {
    const previousEntries = _internals.collectFeaturedItemEntries(featuredPayload([
        layoutItem("old", "Old"),
        layoutItem("stay", "Stay")
    ]));
    const currentEntries = _internals.collectFeaturedItemEntries(featuredPayload([
        layoutItem("stay", "Stay"),
        layoutItem("new", "New")
    ]));

    const payload = _internals.buildFeaturedContentChangePayload({
        titleId: "20CA2",
        previousEntries,
        currentEntries,
        content: {ok: true},
        ts: 123
    });

    assert.equal(payload.ts, 123);
    assert.equal(payload.titleId, "20CA2");
    assert.deepEqual(payload.addedItemIds, ["new"]);
    assert.deepEqual(payload.removedItemIds, ["old"]);
    assert.deepEqual(payload.addedItems, [layoutItem("new", "New")]);
    assert.deepEqual(payload.removedItems, [layoutItem("old", "Old")]);
    assert.equal(payload.addedItemDetails[0].id, "new");
    assert.equal(payload.addedItemDetails[0].creatorName, "New Creator");
    assert.equal(payload.addedItemDetails[0].featuredContext.page.pageId, "DressingRoom_PersonaProfile");
    assert.equal(payload.addedItemDetails[0].featuredContext.row.telemetryId, "dr.header.featured");
    assert.equal(payload.addedItemDetails[0].featuredContext.component.type, "itemListComp");
    assert.equal(payload.removedItemDetails[0].id, "old");
    assert.equal(payload.removedItemDetails[0].creatorName, "Old Creator");
    assert.equal(payload.removedItemDetails[0].featuredContext.row.header, "dr.header.featured");
    assert.deepEqual(payload.currentItemIds, ["stay", "new"]);
    assert.deepEqual(payload.previousItemIds, ["old", "stay"]);
    assert.deepEqual(payload.currentItemDetails.map(item => item.id), ["stay", "new"]);
    assert.deepEqual(payload.previousItemDetails.map(item => item.id), ["old", "stay"]);
});

test("buildFeaturedContentChangePayload returns null when the featured item set is unchanged", () => {
    const previousEntries = _internals.collectFeaturedItemEntries(featuredPayload([layoutItem("one", "One")]));
    const currentEntries = _internals.collectFeaturedItemEntries(featuredPayload([layoutItem("one", "One")]));

    const payload = _internals.buildFeaturedContentChangePayload({
        titleId: "20CA2",
        previousEntries,
        currentEntries,
        content: {}
    });

    assert.equal(payload, null);
});
