// -----------------------------------------------------------------------------
//
// File: test/runtimeValidation.test.js
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
const {validateRuntimeConfig} = require("../src/config/runtimeValidation");

const JWT_SECRET = "a-valid-jwt-secret-with-at-least-32-characters";

test("production can start without an environment device id", () => {
    const errors = validateRuntimeConfig({NODE_ENV: "production", JWT_SECRET});
    assert.deepEqual(errors, []);
});

test("production accepts a configured PlayFab device id", () => {
    const errors = validateRuntimeConfig({NODE_ENV: "production", JWT_SECRET, PLAYFAB_DEVICE_ID: "vmc-installation-1"});
    assert.deepEqual(errors, []);
});

test("development keeps the anonymous device fallback", () => {
    const errors = validateRuntimeConfig({NODE_ENV: "development", JWT_SECRET});
    assert.deepEqual(errors, []);
});

test("runtime validation preserves the JWT secret requirement", () => {
    const errors = validateRuntimeConfig({NODE_ENV: "development", JWT_SECRET: "short"});
    assert.ok(errors.some(message => message.includes("JWT_SECRET")));
});
