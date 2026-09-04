// -----------------------------------------------------------------------------
//
// File: src/config/runtimeValidation.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
//
// -----------------------------------------------------------------------------

function validateRuntimeConfig(env = {}) {
    const errors = [];
    const jwtSecret = typeof env.JWT_SECRET === "string" ? env.JWT_SECRET : "";
    if (jwtSecret.length < 32) errors.push("JWT_SECRET is missing or too short.");

    const production = String(env.NODE_ENV || "").trim().toLowerCase() === "production";
    const deviceId = typeof env.PLAYFAB_DEVICE_ID === "string" ? env.PLAYFAB_DEVICE_ID.trim() : "";
    if (production && !deviceId) {
        errors.push("PLAYFAB_DEVICE_ID is required in production to preserve the PlayFab account identity.");
    }
    return errors;
}

module.exports = {validateRuntimeConfig};
