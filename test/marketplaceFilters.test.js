const test = require("node:test");
const assert = require("node:assert/strict");
const {buildPlayerMarketplaceFilter} = require("../src/utils/marketplaceFilters");
const {loadCreators, resolveCreatorId} = require("../src/utils/creators");

test("buildPlayerMarketplaceFilter returns base filter when creatorName missing", () => {
    const creators = loadCreators();
    const result = buildPlayerMarketplaceFilter("tags/any(t:t eq 'foo')", "", creators);
    assert.equal(result, "tags/any(t:t eq 'foo')");
});

test("buildPlayerMarketplaceFilter builds creator filter", () => {
    const creators = loadCreators();
    const cid = resolveCreatorId(creators, "100Media");
    const result = buildPlayerMarketplaceFilter("", "100Media", creators);
    assert.equal(result, `creatorId eq '${cid.replace(/'/g, "''")}'`);
});

test("buildPlayerMarketplaceFilter combines with existing filter", () => {
    const creators = loadCreators();
    const cid = resolveCreatorId(creators, "100Media");
    const result = buildPlayerMarketplaceFilter("contentType eq '3PP_V2.0'", "100Media", creators);
    assert.equal(result, `(contentType eq '3PP_V2.0') and (creatorId eq '${cid.replace(/'/g, "''")}')`);
});
