// -----------------------------------------------------------------------------
//
// File: test/marketplaceTokens.test.js
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
const {resolveMarketplaceEntityInput} = require("../src/utils/marketplaceTokens");

test("resolveMarketplaceEntityInput prefers entityToken", () => {
    const result = resolveMarketplaceEntityInput({entityToken: "token-1"});
    assert.equal(result.entityToken, "token-1");
    assert.equal(result.masterEntityToken, "");
});

test("resolveMarketplaceEntityInput accepts titleEntityToken", () => {
    const result = resolveMarketplaceEntityInput({titleEntityToken: "token-2"});
    assert.equal(result.entityToken, "token-2");
});

test("resolveMarketplaceEntityInput accepts matching tokens", () => {
    const result = resolveMarketplaceEntityInput({entityToken: "token-3", titleEntityToken: "token-3"});
    assert.equal(result.entityToken, "token-3");
});

test("resolveMarketplaceEntityInput rejects mismatched tokens", () => {
    assert.throws(() => resolveMarketplaceEntityInput({entityToken: "a", titleEntityToken: "b"}), {
        message: "Entity tokens do not match."
    });
});

test("resolveMarketplaceEntityInput falls back to master token + title player id", () => {
    const result = resolveMarketplaceEntityInput({masterEntityToken: "master", titlePlayerAccountId: "tp"});
    assert.equal(result.masterEntityToken, "master");
    assert.equal(result.titlePlayerAccountId, "tp");
});

test("resolveMarketplaceEntityInput requires tokens", () => {
    assert.throws(() => resolveMarketplaceEntityInput({}), {
        message: "Entity token is required."
    });
});
