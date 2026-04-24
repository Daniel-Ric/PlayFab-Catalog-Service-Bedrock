// -----------------------------------------------------------------------------
//
// File: test/eventPayload.test.js
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
const {getCreatorNamesFromPayload} = require("../src/utils/eventPayload");

test("getCreatorNamesFromPayload reads featured content item detail creators", () => {
    const names = getCreatorNamesFromPayload("featured.content.updated", {
        addedItemDetails: [{id: "new", creatorName: "New Creator"}],
        removedItemDetails: [{id: "old", rawItem: {DisplayProperties: {creatorName: "Old Creator"}}}]
    });

    assert.deepEqual(names.sort(), ["new creator", "old creator"]);
});
