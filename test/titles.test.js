// -----------------------------------------------------------------------------
//
// File: test/titles.test.js
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
const {resolveTitle} = require("../src/utils/titles");

test("resolveTitle normalizes aliases from input", () => {
    assert.equal(resolveTitle(" Prod "), "20CA2");
});

test("resolveTitle keeps known aliases valid after normalization", () => {
    assert.equal(resolveTitle("DEv"), "E9D1");
});
