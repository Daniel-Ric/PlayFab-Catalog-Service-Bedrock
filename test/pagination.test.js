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
