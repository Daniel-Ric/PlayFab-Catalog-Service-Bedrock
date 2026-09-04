// -----------------------------------------------------------------------------
//
// File: test/contentUpdateWatcher.test.js
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
const {_internals} = require("../src/services/contentUpdateWatcher");

function makeItem(overrides = {}) {
    return {
        Id: "content-item",
        Title: {NEUTRAL: "Content Item"},
        Rating: {Average: 4, TotalCount: 10},
        DisplayProperties: {
            creatorName: "Creator",
            lastUpdated: "1.21.0",
            packIdentity: [{type: "behaviorpack", uuid: "pack-a", version: "1.0.0"}],
            totalContentFileSize: 1000
        },
        Contents: [{Id: "content-a", Type: "resourcebinary", MinClientVersion: "1.16.0", MaxClientVersion: "65535.65535.65535", Tags: []}],
        ...overrides
    };
}

test("content revision ignores rating and catalog metadata changes", () => {
    const before = makeItem();
    const after = {...before, Rating: {Average: 4.5, TotalCount: 50}, ETag: "new-etag"};
    assert.equal(_internals.contentRevisionHash(before), _internals.contentRevisionHash(after));
    assert.deepEqual(_internals.diffRevision(before, after), []);
});

test("content revision detects pack versions and optimized content variants", () => {
    const before = makeItem();
    const after = makeItem({
        DisplayProperties: {...before.DisplayProperties, lastUpdated: "1.26.40", packIdentity: [{type: "behaviorpack", uuid: "pack-a", version: "1.0.6"}]},
        Contents: [...before.Contents, {Id: "content-b", Type: "resourcebinary", MinClientVersion: "1.26.40", MaxClientVersion: "65535.65535.65535", Tags: ["optimized-1.26.40"]}]
    });
    const changes = _internals.diffRevision(before, after);
    assert.ok(changes.some(change => change.kind === "pack" && change.before.version === "1.0.0" && change.after.version === "1.0.6"));
    assert.ok(changes.some(change => change.kind === "content" && change.after.id === "content-b"));
    assert.ok(changes.some(change => change.kind === "property" && change.key === "gameVersion" && change.after === "1.26.40"));
});

test("buildContentUpdate requires a previous snapshot and a real content change", () => {
    const before = makeItem();
    const previous = {hash: _internals.contentRevisionHash(before), raw: before};
    assert.equal(_internals.buildContentUpdate(previous, {...before, ETag: "changed"}), null);
    assert.equal(_internals.buildContentUpdate(null, before), null);
    const after = makeItem({DisplayProperties: {...before.DisplayProperties, totalContentFileSize: 2000}});
    const update = _internals.buildContentUpdate(previous, after);
    assert.equal(update.id, "content-item");
    assert.ok(update.changes.some(change => change.key === "totalContentFileSize"));
});

test("content revision detects a replaced binary with unchanged compatibility", () => {
    const before = makeItem({Contents: [{Id: "content-a", Url: "https://cdn.example/old.zip", Type: "resourcebinary", MinClientVersion: "1.16.0", MaxClientVersion: "65535.65535.65535", Tags: []}]});
    const after = makeItem({Contents: [{Id: "content-a", Url: "https://cdn.example/new.zip", Type: "resourcebinary", MinClientVersion: "1.16.0", MaxClientVersion: "65535.65535.65535", Tags: []}]});
    const changes = _internals.diffRevision(before, after);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "content");
    assert.equal(changes[0].before.url, null);
    assert.equal(changes[0].after.url, null);
    assert.equal(changes[0].before.urlHost, "cdn.example");
    assert.equal(changes[0].after.urlHost, "cdn.example");
    assert.notEqual(changes[0].before.urlFingerprint, changes[0].after.urlFingerprint);
    assert.equal(JSON.stringify(changes).includes("old.zip"), false);
    assert.equal(JSON.stringify(changes).includes("new.zip"), false);
});

test("content revision restores legacy URL fields only in explicit event mode", () => {
    const before = makeItem({Contents: [{Id: "content-a", Url: "https://cdn.example/old.zip", Type: "resourcebinary"}]});
    const after = makeItem({Contents: [{Id: "content-a", Url: "https://cdn.example/new.zip", Type: "resourcebinary"}]});
    const changes = _internals.diffRevision(before, after, {exposeSensitive: true});
    const update = _internals.buildContentUpdate(
        _internals.snapshotContentItem(before, {exposeSensitive: true}),
        after,
        {exposeSensitive: true}
    );

    assert.equal(changes[0].before.url, "https://cdn.example/old.zip");
    assert.equal(changes[0].after.url, "https://cdn.example/new.zip");
    assert.equal(update.before.Contents[0].Url, "https://cdn.example/old.zip");
    assert.equal(update.after.Contents[0].Url, "https://cdn.example/new.zip");
});

test("content revision ignores expiring URL query strings", () => {
    const before = makeItem({Contents: [{Id: "content-a", Url: "https://cdn.example/content.zip?sig=old", Type: "resourcebinary"}]});
    const after = makeItem({Contents: [{Id: "content-a", Url: "https://cdn.example/content.zip?sig=new", Type: "resourcebinary"}]});

    assert.equal(_internals.contentRevisionHash(before), _internals.contentRevisionHash(after));
    assert.deepEqual(_internals.diffRevision(before, after), []);
    assert.equal(
        _internals.contentRevisionHash(before, {exposeSensitive: true}),
        _internals.contentRevisionHash(after, {exposeSensitive: true})
    );
    assert.deepEqual(_internals.diffRevision(before, after, {exposeSensitive: true}), []);
});

test("content watcher state stores only a URL host and fingerprint", () => {
    const secretUrl = "https://downloads.example/private/content.zip?sig=secret";
    const item = makeItem({
        Images: [{Tag: "thumbnail", Url: "https://images.example/thumb.png"}],
        Contents: [{Id: "content-a", Url: secretUrl, Key: "content-key", Type: "resourcebinary"}]
    });
    const state = new Map([[item.Id, _internals.snapshotContentItem(item)]]);
    const serialized = _internals.serializeState(state);
    const encoded = JSON.stringify(serialized);

    assert.equal(encoded.includes(secretUrl), false);
    assert.equal(encoded.includes("content-key"), false);
    assert.equal(encoded.includes("downloads.example"), true);
    assert.equal(encoded.includes("https://images.example/thumb.png"), true);

    const restored = _internals.deserializeState(serialized).get(item.Id);
    assert.equal(restored.revision.variants[0].urlHost, "downloads.example");
    assert.ok(restored.revision.variants[0].urlFingerprint);
    assert.equal(restored.item.Contents[0].Url, null);
});

test("content watcher migrates legacy raw state without retaining its URL", () => {
    const item = makeItem({Contents: [{Id: "content-a", Url: "https://legacy.example/content.zip?token=secret", Type: "resourcebinary"}]});
    const restored = _internals.deserializeState([{id: item.Id, hash: "legacy", raw: item}]).get(item.Id);

    assert.equal(restored.item.Contents[0].Url, null);
    assert.equal(restored.revision.variants[0].urlHost, "legacy.example");
    assert.equal(JSON.stringify(_internals.serializeState(new Map([[item.Id, restored]]))).includes("token=secret"), false);
});
