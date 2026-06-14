// -----------------------------------------------------------------------------
//
// File: test/marketplaceSearchService.test.js
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
const {_internals} = require("../src/services/marketplaceSearchService");
const { _internals: advancedSearchInternals } = require("../src/services/advancedSearchService");

test("buildSearchItemsPayload maps SearchItems cursor fields", () => {
    const payload = _internals.buildSearchItemsPayload({
        search: " Dragon ",
        filter: "ContentType eq 'x'",
        orderBy: "StartDate desc",
        select: "title,images",
        language: "de-DE",
        count: 500,
        continuationToken: "abc",
        storeId: "store-1"
    });

    assert.deepEqual(payload, {
        Search: "Dragon",
        Count: 50,
        Filter: "ContentType eq 'x'",
        OrderBy: "StartDate desc",
        Select: "title,images",
        Language: "de-DE",
        ContinuationToken: "abc",
        Store: {Id: "store-1"}
    });
});

test("buildSearchItemsPayload drops unsupported SearchItems select fields", () => {
    const payload = _internals.buildSearchItemsPayload({
        select: "id,Title,images,priceOptions,displayProperties,rating,alternateIds,StartDate,contentType,tags"
    });

    assert.equal(payload.Select, "title,images,startDate");
});

test("sanitizeSearchItemsSelect omits Select when no supported fields remain", () => {
    const payload = _internals.buildSearchItemsPayload({
        select: "id,priceOptions,displayProperties,rating,alternateIds,contentType,tags"
    });

    assert.equal(Object.hasOwn(payload, "Select"), false);
});

test("normalizeStore supports alternate ids", () => {
    const store = _internals.normalizeStore({
        storeAlternateId: {type: "FriendlyId", value: "sale-store"}
    });

    assert.deepEqual(store, {
        AlternateId: {
            Type: "FriendlyId",
            Value: "sale-store"
        }
    });
});

test("normalizeSearchItem extracts marketplace summary fields", () => {
    const result = _internals.normalizeSearchItem({
        Id: "item-1",
        AlternateIds: [{Type: "FriendlyId", Value: "friendly-1"}],
        Title: {"de-DE": "Titel", NEUTRAL: "Title"},
        Description: {NEUTRAL: "Description"},
        Keywords: {"de-DE": {Values: ["welt"]}},
        DisplayProperties: {creatorName: "Creator", price: 660},
        Images: [{Id: "img-1", Tag: "thumbnail", Url: "https://cdn.example/thumb.png"}],
        Rating: {Average: 4.5, TotalCount: 12},
        ContentType: "MarketplaceDurableCatalog_V1.2",
        Tags: ["worldtemplate"],
        Platforms: ["windows"]
    }, "de-DE");

    assert.equal(result.id, "item-1");
    assert.equal(result.friendlyId, "friendly-1");
    assert.equal(result.title, "Titel");
    assert.equal(result.thumbnail, "https://cdn.example/thumb.png");
    assert.deepEqual(result.price, {amount: 660, currencyId: "Minecoins"});
    assert.deepEqual(result.rating, {average: 4.5, totalCount: 12});
});

test("auditOne returns health issues for incomplete catalog content", () => {
    const result = _internals.auditOne({
        Id: "item-1",
        Title: {NEUTRAL: "Title"},
        Description: {},
        Images: [{Tag: "thumbnail", Url: "not-a-url"}],
        Contents: [{Url: "https://cdn.example/content.mcworld", MinClientVersion: "1.21.0", MaxClientVersion: "1.20.0"}],
        Platforms: []
    }, ["de-DE"]);

    assert.ok(result.issues.includes("missingScreenshots"));
    assert.ok(result.issues.includes("invalidImageUrl"));
    assert.ok(result.issues.includes("invalidClientVersionRange"));
    assert.ok(result.issues.includes("missingPlatforms"));
    assert.ok(result.issues.includes("missingDeepLinks"));
    assert.ok(result.issues.includes("missingTitle:de-DE"));
    assert.ok(result.issues.includes("missingDescription:de-DE"));
});

test("advanced search request accepts cursor top-level fields", () => {
    const result = advancedSearchInternals.validateRequestBody({
        mode: "cursor",
        query: {text: "Dragon"},
        language: "de-DE",
        select: "title,images",
        storeId: "store-1",
        count: 24,
        cursorPages: 8,
        continuationToken: "next"
    });

    assert.equal(result.mode, "cursor");
    assert.equal(result.language, "de-DE");
    assert.equal(result.count, 24);
    assert.equal(result.cursorPages, 8);
    assert.deepEqual(result.store, {Id: "store-1"});
});

test("openapi exposes marketplace search additions", () => {
    const spec = getOpenApiSpec();
    assert.ok(spec.paths["/marketplace/search/items/{alias}"]);
    assert.ok(spec.paths["/marketplace/search/store/{alias}"]);
    assert.ok(spec.paths["/marketplace/search/suggest/{alias}"]);
    assert.ok(spec.paths["/marketplace/search/localized/{alias}"]);
    assert.ok(spec.paths["/marketplace/search/audit/{alias}"]);
    assert.ok(spec.paths["/marketplace/resolve/batch/{alias}"]);
});
