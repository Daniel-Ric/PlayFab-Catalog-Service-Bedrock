// -----------------------------------------------------------------------------
//
// File: test/sessionController.test.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
//
// -----------------------------------------------------------------------------

const test = require("node:test");
const assert = require("node:assert/strict");
const {_internals} = require("../src/controllers/sessionController");
const {getOpenApiSpec} = require("../src/config/swagger");

test("session status exposes metadata without upstream credentials", () => {
    const status = _internals.projectSessionStatus({
        SessionTicket: "session-secret",
        EntityToken: "entity-secret",
        PlayFabId: "playfab-1",
        TokenExpiration: "2026-09-05T12:00:00.000Z",
        expiresAt: Date.parse("2026-09-05T12:00:00.000Z")
    });

    assert.deepEqual(status, {
        authenticated: true,
        playFabId: "playfab-1",
        expiresAt: "2026-09-05T12:00:00.000Z"
    });
    assert.equal(JSON.stringify(status).includes("session-secret"), false);
    assert.equal(JSON.stringify(status).includes("entity-secret"), false);
});

test("OpenAPI exposes session metadata and no caller-token relay endpoint", () => {
    const spec = getOpenApiSpec();
    const properties = spec.paths["/session/{alias}"].get.responses["200"].content["application/json"].schema.properties;

    assert.deepEqual(Object.keys(properties).sort(), ["authenticated", "expiresAt", "playFabId"]);
    assert.equal(spec.paths["/marketplace/player/search/{alias}"], undefined);
});
