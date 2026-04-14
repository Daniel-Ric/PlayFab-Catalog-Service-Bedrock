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
