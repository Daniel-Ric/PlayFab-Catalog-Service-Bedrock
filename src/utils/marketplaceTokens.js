// -----------------------------------------------------------------------------
//
// File: src/utils/marketplaceTokens.js
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

function asCleanString(value) {
    if (typeof value !== "string") return "";
    return value.trim();
}

function resolveMarketplaceEntityInput(payload = {}) {
    const entityToken = asCleanString(payload.entityToken);
    const titleEntityToken = asCleanString(payload.titleEntityToken);
    const masterEntityToken = asCleanString(payload.masterEntityToken);
    const titlePlayerAccountId = asCleanString(payload.titlePlayerAccountId);

    if (entityToken && titleEntityToken && entityToken !== titleEntityToken) {
        const err = new Error("Entity tokens do not match.");
        err.status = 400;
        throw err;
    }

    const effectiveEntityToken = entityToken || titleEntityToken;
    if (effectiveEntityToken) {
        return {
            entityToken: effectiveEntityToken,
            masterEntityToken: "",
            titlePlayerAccountId: ""
        };
    }

    if (masterEntityToken && titlePlayerAccountId) {
        return {entityToken: "", masterEntityToken, titlePlayerAccountId};
    }

    const err = new Error("Entity token is required.");
    err.status = 400;
    throw err;
}

module.exports = {resolveMarketplaceEntityInput};
