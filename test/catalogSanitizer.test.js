// -----------------------------------------------------------------------------
//
// File: test/catalogSanitizer.test.js
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
const {
    sanitizeCatalogItem,
    canExposeSensitiveCatalogFields,
    requiresAdminForSensitiveFields
} = require("../src/utils/catalogSanitizer");
const {projectCatalogItem} = require("../src/utils/projectors");
const {transformItem} = require("../src/utils/playfab");
const {_internals: searchInternals} = require("../src/services/marketplaceSearchService");

function catalogItem() {
    return {
        Id: "item-1",
        Title: {NEUTRAL: "Item"},
        DisplayProperties: {creatorName: "Creator", contentKey: "secret-key"},
        Images: [{Id: "image-1", Tag: "thumbnail", Url: "https://cdn.example/image.png"}],
        Contents: [{Id: "content-1", Url: "https://cdn.example/private.zip", Key: "content-secret"}],
        nested: {EntityToken: "entity-secret"}
    };
}

test("catalog sanitizer preserves legacy keys while redacting sensitive values", () => {
    const result = sanitizeCatalogItem(catalogItem());
    const serialized = JSON.stringify(result);

    assert.equal(result.Images[0].Url, "https://cdn.example/image.png");
    assert.equal(result.Contents[0].Url, null);
    assert.equal(result.Contents[0].Key, null);
    assert.equal(result.DisplayProperties.contentKey, null);
    assert.equal(result.nested.EntityToken, null);
    assert.equal(serialized.includes("private.zip"), false);
    assert.equal(serialized.includes("secret-key"), false);
    assert.equal(serialized.includes("entity-secret"), false);
});

test("catalog sanitizer handles lowercase catalog content fields", () => {
    const result = sanitizeCatalogItem({
        contents: [{url: "https://cdn.example/private.zip", contentKey: "secret"}],
        images: [{url: "https://cdn.example/public.png"}]
    });

    assert.deepEqual(result.contents, [{url: null, contentKey: null}]);
    assert.equal(result.images[0].url, "https://cdn.example/public.png");
});

test("catalog REST and event projections keep public fields without raw content URLs", () => {
    const projected = projectCatalogItem(catalogItem());
    const transformed = transformItem(catalogItem());
    const searched = searchInternals.normalizeSearchItem(catalogItem(), "en-US", false);

    assert.equal(projected.thumbnail, "https://cdn.example/image.png");
    assert.equal(projected.rawItem.Images[0].Url, "https://cdn.example/image.png");
    assert.equal(JSON.stringify(projected).includes("private.zip"), false);
    assert.equal(JSON.stringify(transformed).includes("private.zip"), false);
    assert.equal(JSON.stringify(searched).includes("private.zip"), false);
});

test("explicit compatibility mode restores sensitive catalog and event values", () => {
    const catalogValue = process.env.EXPOSE_SENSITIVE_CATALOG_FIELDS;
    const eventValue = process.env.EXPOSE_SENSITIVE_EVENT_FIELDS;
    process.env.EXPOSE_SENSITIVE_CATALOG_FIELDS = "true";
    process.env.EXPOSE_SENSITIVE_EVENT_FIELDS = "true";
    try {
        const transformed = transformItem(catalogItem());
        const projected = projectCatalogItem(catalogItem());
        const searched = searchInternals.normalizeSearchItem(catalogItem(), "en-US", true);

        assert.equal(transformed.Contents[0].Url, "https://cdn.example/private.zip");
        assert.equal(projected.rawItem.Contents[0].Key, "content-secret");
        assert.equal(searched.rawItem.nested.EntityToken, "entity-secret");
    } finally {
        if (catalogValue === undefined) delete process.env.EXPOSE_SENSITIVE_CATALOG_FIELDS;
        else process.env.EXPOSE_SENSITIVE_CATALOG_FIELDS = catalogValue;
        if (eventValue === undefined) delete process.env.EXPOSE_SENSITIVE_EVENT_FIELDS;
        else process.env.EXPOSE_SENSITIVE_EVENT_FIELDS = eventValue;
    }
});

test("sensitive compatibility access requires both configuration and admin role", () => {
    const enabled = {EXPOSE_SENSITIVE_CATALOG_FIELDS: "true", EXPOSE_SENSITIVE_EVENT_FIELDS: "true"};

    assert.equal(canExposeSensitiveCatalogFields({role: "admin"}, enabled), true);
    assert.equal(canExposeSensitiveCatalogFields({role: "viewer"}, enabled), false);
    assert.equal(canExposeSensitiveCatalogFields({role: "admin"}, {}), false);
    assert.equal(requiresAdminForSensitiveFields("/marketplace/details/prod/item", enabled), true);
    assert.equal(requiresAdminForSensitiveFields("/events", enabled), true);
    assert.equal(requiresAdminForSensitiveFields("/marketplace-preview", enabled), false);
    assert.equal(requiresAdminForSensitiveFields("/health", enabled), false);
});
