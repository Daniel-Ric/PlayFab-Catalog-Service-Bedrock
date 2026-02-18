// -----------------------------------------------------------------------------
//
// File: src/utils/corsOrigins.js
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

const DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "https://view-marketplace.net"
];

function normalizeOrigin(origin) {
    return String(origin || "").trim().replace(/\/+$/, "");
}

function getConfiguredCorsOrigins() {
    const rawOrigins = (process.env.CORS_ORIGINS || "").trim();
    const origins = rawOrigins
        ? rawOrigins.split(",")
        : DEFAULT_CORS_ORIGINS;

    return origins
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean);
}

module.exports = {
    DEFAULT_CORS_ORIGINS,
    normalizeOrigin,
    getConfiguredCorsOrigins,
};
