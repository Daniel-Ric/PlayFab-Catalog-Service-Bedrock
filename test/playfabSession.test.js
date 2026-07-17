// -----------------------------------------------------------------------------
//
// File: test/playfabSession.test.js
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
const {_internals} = require("../src/utils/playfab");

test("resolvePlayFabDeviceId uses a configured stable device id", () => {
    assert.equal(_internals.resolvePlayFabDeviceId({PLAYFAB_DEVICE_ID: "  vmc-installation-1  "}), "vmc-installation-1");
});

test("resolvePlayFabDeviceId keeps the process fallback stable", () => {
    const first = _internals.resolvePlayFabDeviceId({});
    const second = _internals.resolvePlayFabDeviceId({});

    assert.match(first, /^vmc-[a-f0-9]{32}$/);
    assert.equal(second, first);
});

test("503 retries honor Retry-After and otherwise use a longer delay", () => {
    assert.equal(_internals.retryDelayForStatus(503, {"retry-after": "2"}, 0), 2000);
    assert.ok(_internals.retryDelayForStatus(503, {}, 0) >= 500);
});

test("resolveSessionExpiresAt applies the PlayFab expiration safety window", () => {
    const now = Date.parse("2026-07-16T12:00:00Z");
    const expiresAt = _internals.resolveSessionExpiresAt("2026-07-16T13:00:00Z", now);

    assert.equal(expiresAt, Date.parse("2026-07-16T12:59:00Z"));
});

test("resolveSessionExpiresAt falls back when expiration is absent or expired", () => {
    const now = Date.parse("2026-07-16T12:00:00Z");
    const absent = _internals.resolveSessionExpiresAt(null, now);
    const expired = _internals.resolveSessionExpiresAt("2026-07-16T11:00:00Z", now);

    assert.ok(absent > now);
    assert.equal(expired, absent);
});

test("resolveSessionExpiresAt keeps a short-lived token usable", () => {
    const now = Date.parse("2026-07-16T12:00:00Z");
    const tokenExpiration = Date.parse("2026-07-16T12:00:30Z");
    const expiresAt = _internals.resolveSessionExpiresAt(new Date(tokenExpiration).toISOString(), now);

    assert.ok(expiresAt > now);
    assert.ok(expiresAt < tokenExpiration);
});
