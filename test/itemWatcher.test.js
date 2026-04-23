const test = require("node:test");
const assert = require("node:assert/strict");
const {_internals} = require("../src/services/itemWatcher");

const SINCE_TS = Date.parse("2026-04-20T09:55:00.000Z");
const RECENT_DATE = "2026-04-20T10:00:00.000Z";
const OLD_DATE = "2026-04-20T08:00:00.000Z";

function makeItem(overrides = {}) {
    return {
        Id: "item-1",
        Title: {NEUTRAL: "Test Item"},
        Description: {NEUTRAL: "Desc"},
        Tags: ["tag"],
        ContentType: "content",
        Platforms: ["android"],
        Images: [{Tag: "thumbnail", Url: "https://example.com/thumb.png"}],
        DisplayProperties: {creatorName: "Creator"},
        ETag: "etag-1",
        CreationDate: RECENT_DATE,
        StartDate: RECENT_DATE,
        LastModifiedDate: RECENT_DATE,
        ...overrides
    };
}

function previousStateFor(item) {
    return {
        hash: _internals.classifyItemChange(item, null, SINCE_TS).nextHash,
        raw: item
    };
}

test("classifyItemChange marks first-seen recent items as created", () => {
    const result = _internals.classifyItemChange(makeItem(), null, SINCE_TS);
    assert.equal(result.kind, "created");
});

test("classifyItemChange marks first-seen items with recent mod date as updated", () => {
    const item = makeItem({
        CreationDate: OLD_DATE,
        StartDate: OLD_DATE,
        LastModifiedDate: RECENT_DATE
    });

    const result = _internals.classifyItemChange(item, null, SINCE_TS);
    assert.equal(result.kind, "updated");
});

test("classifyItemChange keeps changed known items as updated", () => {
    const previousItem = makeItem({Title: {NEUTRAL: "Before"}, ETag: "etag-old"});
    const currentItem = makeItem({Title: {NEUTRAL: "After"}, ETag: "etag-new"});

    const result = _internals.classifyItemChange(currentItem, previousStateFor(previousItem), SINCE_TS);
    assert.equal(result.kind, "updated");
});

test("classifyItemChange does not re-emit unchanged known items", () => {
    const item = makeItem();

    const result = _internals.classifyItemChange(item, previousStateFor(item), SINCE_TS);

    assert.equal(result.kind, null);
});

test("classifyItemChange ignores stale modifications for known items", () => {
    const previousItem = makeItem({
        Title: {NEUTRAL: "Before"},
        LastModifiedDate: OLD_DATE
    });
    const currentItem = makeItem({
        Title: {NEUTRAL: "After"},
        ETag: "etag-new",
        LastModifiedDate: OLD_DATE
    });

    const result = _internals.classifyItemChange(currentItem, previousStateFor(previousItem), SINCE_TS);

    assert.equal(result.kind, null);
});

test("classifyItemChange treats first-seen items without recent timestamps as created", () => {
    const item = makeItem({
        CreationDate: OLD_DATE,
        StartDate: OLD_DATE,
        LastModifiedDate: OLD_DATE
    });

    const result = _internals.classifyItemChange(item, null, SINCE_TS);

    assert.equal(result.kind, "created");
});

test("classifyItemChange supports lower-case catalog date fields", () => {
    const item = makeItem({
        CreationDate: undefined,
        StartDate: undefined,
        LastModifiedDate: undefined,
        creationDate: OLD_DATE,
        startDate: OLD_DATE,
        lastModifiedDate: RECENT_DATE
    });

    const result = _internals.classifyItemChange(item, null, SINCE_TS);

    assert.equal(result.kind, "updated");
});

test("fallback offset helpers round-trip offsets", () => {
    const token = _internals.makeFallbackOffset(400);
    assert.equal(token, "offset:400");
    assert.equal(_internals.parseFallbackOffset(token), 400);
});

test("fallback offset helpers clamp invalid offsets to zero", () => {
    assert.equal(_internals.makeFallbackOffset(-25), "offset:0");
    assert.equal(_internals.parseFallbackOffset("offset:-25"), 0);
    assert.equal(_internals.parseFallbackOffset("offset:not-a-number"), 0);
    assert.equal(_internals.parseFallbackOffset("bogus"), 0);
});

test("classifyItemChange returns a stable hash for known items", () => {
    const result = _internals.classifyItemChange(makeItem(), null, SINCE_TS);
    assert.equal(typeof result.nextHash, "string");
    assert.notEqual(result.nextHash.length, 0);
});
