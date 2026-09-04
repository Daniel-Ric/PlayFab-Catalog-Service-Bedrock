// -----------------------------------------------------------------------------
//
// File: test/marketplaceFilters.test.js
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
const {buildPlayerMarketplaceFilter} = require("../src/utils/marketplaceFilters");
const {buildFilter: buildQueryFilter, buildContentTypeFilter, filterItemsByDate} = require("../src/utils/filter");
const { _internals: advancedSearchInternals } = require("../src/services/advancedSearchService");
const { _internals: marketplaceServiceInternals } = require("../src/services/marketplaceService");
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

test("buildFilter maps PlayFab date query filters", () => {
    const result = buildQueryFilter({
        query: {
            startDateFrom: "2026-01-01T00:00:00Z",
            lastModifiedDateTo: "2026-02-01T12:30:00Z",
            creationDateFrom: "2025-12-01"
        }
    }, loadCreators());
    assert.equal(result, "CreationDate ge 2025-12-01T00:00:00.000Z and LastModifiedDate le 2026-02-01T12:30:00.000Z and StartDate ge 2026-01-01T00:00:00.000Z");
});

test("buildFilter leaves contentType to search-specific filters", () => {
    const result = buildQueryFilter({
        query: {
            contentType: "3PServerContent_V1.2",
            creatorName: "100Media"
        }
    }, loadCreators());
    const cid = resolveCreatorId(loadCreators(), "100Media");
    assert.equal(result, `creatorId eq '${cid.replace(/'/g, "''")}'`);
});

test("buildFilter does not require creatorName for basic search", () => {
    const result = buildQueryFilter({
        query: {
            startDateFrom: "2026-01-01T00:00:00Z"
        }
    }, loadCreators());
    assert.equal(result, "StartDate ge 2026-01-01T00:00:00.000Z");
});

test("basic search text is forwarded as full-text, not exact phrase", () => {
    const result = marketplaceServiceInternals.buildBasicSearchText("  Dragon   Fire  ");
    assert.equal(result, "Dragon Fire");
});

test("latest marketplace order defaults to StartDate descending", () => {
    const result = marketplaceServiceInternals.resolveOrderBy("", "startDate desc");
    assert.equal(result, "startDate desc");
});

test("startDateRangeQueries splits large all-item ranges", () => {
    const result = marketplaceServiceInternals.startDateRangeQueries({
        startDateFrom: "2017-01-01T00:00:00Z",
        startDateTo: "2026-01-01T00:00:00Z"
    });

    assert.ok(result.length > 1);
    assert.equal(result[0].startDateTo, "2026-01-01T00:00:00.000Z");
    assert.equal(result[result.length - 1].startDateFrom, "2017-01-01T00:00:00.000Z");
});

test("startDateRangeQueries covers very large ranges without exceeding the chunk cap", () => {
    const result = marketplaceServiceInternals.startDateRangeQueries({
        startDateFrom: "1900-01-01T00:00:00Z",
        startDateTo: "2026-01-01T00:00:00Z"
    });

    assert.ok(result.length <= 80);
    assert.equal(result[result.length - 1].startDateFrom, "1900-01-01T00:00:00.000Z");
});

test("uniqueById removes duplicate items from split all-item ranges", () => {
    const result = marketplaceServiceInternals.uniqueById([
        {Id: "one", StartDate: "2026-01-01T00:00:00Z"},
        {Id: "one", StartDate: "2026-01-01T00:00:00Z"},
        {Id: "two", StartDate: "2025-01-01T00:00:00Z"}
    ]);

    assert.deepEqual(result.map(item => item.Id), ["one", "two"]);
});

test("sortItemsByOrder keeps merged all-item ranges globally ordered", () => {
    const result = marketplaceServiceInternals.sortItemsByOrder([
        {Id: "old", StartDate: "2024-01-01T00:00:00Z"},
        {Id: "new", StartDate: "2026-01-01T00:00:00Z"},
        {Id: "middle", StartDate: "2025-01-01T00:00:00Z"}
    ], "startDate desc");

    assert.deepEqual(result.map(item => item.Id), ["new", "middle", "old"]);
});

test("parseExpand only enables references when requested", () => {
    assert.equal(marketplaceServiceInternals.parseExpand("").refs, false);
    assert.equal(marketplaceServiceInternals.parseExpand("prices,reviews").refs, false);
    assert.equal(marketplaceServiceInternals.parseExpand("refs").refs, true);
    assert.equal(marketplaceServiceInternals.parseExpand("references").refs, true);
});

test("list enrichment flags can disable full items and references", () => {
    assert.equal(marketplaceServiceInternals.shouldEnrichFullItems({full: "false"}), false);
    assert.equal(marketplaceServiceInternals.shouldEnrichFullItems({enrich: "0"}), false);
    assert.equal(marketplaceServiceInternals.shouldEnrichFullItems({full: "true"}), true);
    assert.equal(marketplaceServiceInternals.shouldResolveReferences({refs: "false"}), false);
    assert.equal(marketplaceServiceInternals.shouldResolveReferences({references: "0"}), false);
    assert.equal(marketplaceServiceInternals.shouldResolveReferences({refs: "true"}), true);
    assert.equal(marketplaceServiceInternals.shouldResolveReferences({}, false), false);
});

test("full item enrichment cannot restore private content fields", () => {
    const summary = {Id: "item-1", Title: {NEUTRAL: "Summary"}};
    const full = {
        Id: "item-1",
        Title: {NEUTRAL: "Full"},
        Images: [{Url: "https://images.example/thumb.png"}],
        Contents: [{Url: "https://downloads.example/private.zip", Key: "content-key"}],
        nested: {EntityToken: "entity-secret"}
    };

    const [result] = marketplaceServiceInternals.mergeFullItems([summary], [full]);
    const encoded = JSON.stringify(result);

    assert.equal(result.Title.NEUTRAL, "Full");
    assert.equal(result.Images[0].Url, "https://images.example/thumb.png");
    assert.equal(encoded.includes("private.zip"), false);
    assert.equal(encoded.includes("content-key"), false);
    assert.equal(encoded.includes("entity-secret"), false);
});

test("readCatalogTotal returns upstream total count variants", () => {
    assert.equal(marketplaceServiceInternals.readCatalogTotal({TotalCount: 12}), 12);
    assert.equal(marketplaceServiceInternals.readCatalogTotal({Count: 42601}), 42601);
    assert.equal(marketplaceServiceInternals.readCatalogTotal({total: 4}), 4);
    assert.equal(marketplaceServiceInternals.readCatalogTotal({}), null);
});

test("buildContentTypeFilter supports multiple content types", () => {
    const result = buildContentTypeFilter(["3PServerContent_V1.2", "shell_3PServerContent_V1.2"]);
    assert.equal(result, "(ContentType eq '3PServerContent_V1.2' or ContentType eq 'shell_3PServerContent_V1.2')");
});

test("filterItemsByDate filters raw items and sales rawItem entries", () => {
    const items = [
        {Id: "one", StartDate: "2026-01-10T00:00:00Z"},
        {Id: "two", StartDate: "2025-12-10T00:00:00Z"},
        {id: "three", rawItem: {StartDate: "2026-01-20T00:00:00Z"}}
    ];
    const result = filterItemsByDate(items, {startDateFrom: "2026-01-01T00:00:00Z"});
    assert.deepEqual(result.map(item => item.Id || item.id), ["one", "three"]);
});

test("buildFilter maps contentKinds to tag filters", () => {
    const filter = advancedSearchInternals.buildFilter("alias", {filters: {contentKinds: ["skinpack", "world"]}});
    assert.equal(filter, "(tags/any(t:t eq 'skinpack') or tags/any(t:t eq 'worldtemplate'))");
});

test("buildFilter maps server contentKinds to server tag filter", () => {
    const filter = advancedSearchInternals.buildFilter("alias", {filters: {contentKinds: ["server"]}});
    assert.equal(filter, "tags/any(t:t eq '3PServerContent')");
});

test("advanced buildPlayFabFilter maps contentType filters", () => {
    const filter = advancedSearchInternals.buildPlayFabFilter({
        contentTypes: ["3PServerContent_V1.2", "shell_3PServerContent_V1.2"]
    });
    assert.equal(filter, "(ContentType eq '3PServerContent_V1.2' or ContentType eq 'shell_3PServerContent_V1.2')");
});

test("advanced buildPlayFabFilter maps server contentKinds to server content types", () => {
    const filter = advancedSearchInternals.buildPlayFabFilter({
        contentKinds: ["server"]
    });
    assert.equal(filter, "(ContentType eq '3PServerContent_V1.2' or ContentType eq '3PServerContent_V1.2_pf' or ContentType eq 'shell_3PServerContent_V1.2')");
});

test("buildFilter maps persona contentKinds to exclude tags", () => {
    const filter = advancedSearchInternals.buildFilter("alias", {filters: {contentKinds: ["persona"]}});
    assert.equal(filter, "not (tags/any(t:t eq 'worldtemplate') or tags/any(t:t eq 'skinpack'))");
});

test("buildFilter rejects unknown contentKinds", () => {
    assert.throws(() => advancedSearchInternals.buildFilter("alias", {filters: {contentKinds: ["mystery"]}}), /Unknown contentKinds/);
});

test("buildFilter rejects raw filter", () => {
    assert.throws(() => advancedSearchInternals.buildFilter("alias", {filters: {raw: "displayProperties/featured eq true"}}), /Raw filters are not supported/);
});
