const test = require("node:test");
const assert = require("node:assert/strict");
const {sanitizeCatalogItem} = require("../src/utils/catalogSanitizer");
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

test("catalog sanitizer removes content locations and credential-like fields", () => {
    const result = sanitizeCatalogItem(catalogItem());
    const serialized = JSON.stringify(result);

    assert.equal(result.Images[0].Url, "https://cdn.example/image.png");
    assert.equal(Object.hasOwn(result.Contents[0], "Url"), false);
    assert.equal(serialized.includes("private.zip"), false);
    assert.equal(serialized.includes("secret-key"), false);
    assert.equal(serialized.includes("entity-secret"), false);
});

test("catalog sanitizer handles lowercase catalog content fields", () => {
    const result = sanitizeCatalogItem({
        contents: [{url: "https://cdn.example/private.zip", contentKey: "secret"}],
        images: [{url: "https://cdn.example/public.png"}]
    });

    assert.deepEqual(result.contents, [{}]);
    assert.equal(result.images[0].url, "https://cdn.example/public.png");
});

test("catalog REST and event projections keep public fields without raw content URLs", () => {
    const projected = projectCatalogItem(catalogItem());
    const transformed = transformItem(catalogItem());
    const searched = searchInternals.normalizeSearchItem(catalogItem(), "en-US", true);

    assert.equal(projected.thumbnail, "https://cdn.example/image.png");
    assert.equal(projected.rawItem.Images[0].Url, "https://cdn.example/image.png");
    assert.equal(JSON.stringify(projected).includes("private.zip"), false);
    assert.equal(JSON.stringify(transformed).includes("private.zip"), false);
    assert.equal(JSON.stringify(searched).includes("private.zip"), false);
});
