// -----------------------------------------------------------------------------
//
// File: test/itemWatcher.test.js
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

test("classifyItemChange uses the wider created window for first-seen items", () => {
    const updatedSinceTs = Date.parse("2026-05-14T00:22:00.000Z");
    const createdSinceTs = Date.parse("2026-05-13T00:22:00.000Z");
    const item = makeItem({
        CreationDate: "2026-05-14T00:21:28.261Z",
        StartDate: "2026-05-13T17:00:00.000Z",
        LastModifiedDate: "2026-05-14T00:21:59.000Z"
    });

    const result = _internals.classifyItemChange(item, null, updatedSinceTs, createdSinceTs);

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

test("classifyItemChange prefers created for known items whose created event was suppressed", () => {
    const previousItem = makeItem({Title: {NEUTRAL: "Draft"}, ETag: "etag-draft"});
    const currentItem = makeItem({Title: {NEUTRAL: "Published"}, ETag: "etag-published"});
    const prev = {
        ...previousStateFor(previousItem),
        createdNotified: false
    };

    const result = _internals.classifyItemChange(currentItem, prev, SINCE_TS, SINCE_TS);

    assert.equal(result.kind, "created");
    assert.equal(result.createdNotified, true);
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

test("changed item requests use a wider created visibility window", () => {
    const instantSinceIso = "2026-04-20T10:00:00.000Z";
    const createdSinceIso = "2026-04-19T10:00:00.000Z";

    const requests = _internals.buildChangedItemRequests(instantSinceIso, createdSinceIso);

    assert.deepEqual(requests, [
        {field: "CreationDate", sinceIso: createdSinceIso},
        {field: "StartDate", sinceIso: createdSinceIso},
        {field: "LastModifiedDate", sinceIso: instantSinceIso}
    ]);
});

test("classifyBootstrapItemChange marks first-seen visible items as created", () => {
    const result = _internals.classifyBootstrapItemChange(makeItem(), null, SINCE_TS, SINCE_TS);

    assert.equal(result.kind, "created");
    assert.equal(result.createdNotified, false);
});

test("classifyBootstrapItemChange does not emit old first-seen bootstrap items", () => {
    const item = makeItem({
        CreationDate: OLD_DATE,
        StartDate: OLD_DATE,
        LastModifiedDate: OLD_DATE
    });

    const result = _internals.classifyBootstrapItemChange(item, null, SINCE_TS, SINCE_TS);

    assert.equal(result.kind, null);
    assert.equal(result.createdNotified, true);
});

test("classifyBootstrapItemChange marks changed persisted items as updated", () => {
    const previousItem = makeItem({Title: {NEUTRAL: "Before"}, ETag: "etag-old"});
    const currentItem = makeItem({Title: {NEUTRAL: "After"}, ETag: "etag-new"});

    const result = _internals.classifyBootstrapItemChange(currentItem, previousStateFor(previousItem), SINCE_TS, SINCE_TS);

    assert.equal(result.kind, "updated");
});

test("classifyBootstrapItemChange prefers unsent created over updated", () => {
    const previousItem = makeItem({Title: {NEUTRAL: "Draft"}, ETag: "etag-draft"});
    const currentItem = makeItem({Title: {NEUTRAL: "Published"}, ETag: "etag-published"});
    const prev = {
        ...previousStateFor(previousItem),
        createdNotified: false
    };

    const result = _internals.classifyBootstrapItemChange(currentItem, prev, SINCE_TS, SINCE_TS);

    assert.equal(result.kind, "created");
    assert.equal(result.createdNotified, true);
});

test("watcher state serializes and deserializes entries", () => {
    const item = makeItem();
    const state = new Map([["item-1", {
        ...previousStateFor(item),
        createdNotified: false
    }]]);

    const restored = _internals.deserializeState(_internals.serializeState(state));

    assert.equal(restored.get("item-1").hash, state.get("item-1").hash);
    assert.deepEqual(restored.get("item-1").raw, item);
    assert.equal(restored.get("item-1").createdNotified, false);
});

test("watcher state treats legacy entries as already created-notified", () => {
    const item = makeItem();
    const state = _internals.deserializeState([{
        id: "item-1",
        hash: previousStateFor(item).hash,
        raw: item
    }]);

    assert.equal(state.get("item-1").createdNotified, true);
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

test("pagination continues when a partial detail page has a continuation token", async () => {
    const pages = [
        {items: [{Id: "item-1"}], continuationToken: "page-2", hitCount: 5},
        {items: [{Id: "item-2"}], continuationToken: null, hitCount: 5}
    ];
    const requestedTokens = [];

    const result = await _internals.collectPaginatedItems(5, 10, async continuationToken => {
        requestedTokens.push(continuationToken);
        return pages.shift();
    });

    assert.deepEqual(requestedTokens, [null, "page-2"]);
    assert.deepEqual(result.map(item => item.Id), ["item-1", "item-2"]);
});

test("pagination limits by scanned search hits, not valid detail items", async () => {
    let calls = 0;

    const result = await _internals.collectPaginatedItems(5, 10, async () => {
        calls += 1;
        return {items: [], continuationToken: `page-${calls + 1}`, hitCount: 5};
    });

    assert.equal(calls, 2);
    assert.deepEqual(result, []);
});

test("pagination stops on repeated continuation tokens", async () => {
    let calls = 0;

    const result = await _internals.collectPaginatedItems(5, 10, async () => {
        calls += 1;
        return {items: [{Id: `item-${calls}`}], continuationToken: "same-token"};
    });

    assert.equal(calls, 2);
    assert.deepEqual(result.map(item => item.Id), ["item-1", "item-2"]);
});

test("classifyItemChange returns a stable hash for known items", () => {
    const result = _internals.classifyItemChange(makeItem(), null, SINCE_TS);
    assert.equal(typeof result.nextHash, "string");
    assert.notEqual(result.nextHash.length, 0);
});
