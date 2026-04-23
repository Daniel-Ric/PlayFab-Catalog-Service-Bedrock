// -----------------------------------------------------------------------------
//
// File: src/scripts/run-node-tests.js
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

const {spawnSync} = require("node:child_process");

function supportsTestIsolationFlag() {
    return process.allowedNodeEnvironmentFlags.has("--test-isolation")
        || process.allowedNodeEnvironmentFlags.has("--test-isolation=none");
}

const args = supportsTestIsolationFlag()
    ? ["--test", "--test-isolation=none"]
    : ["--test"];

const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env
});

if (result.error) {
    throw result.error;
}

process.exit(result.status ?? 1);
