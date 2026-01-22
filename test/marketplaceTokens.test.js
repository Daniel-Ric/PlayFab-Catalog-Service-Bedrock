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
