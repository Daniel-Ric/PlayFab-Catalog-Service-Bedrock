// -----------------------------------------------------------------------------
//
// File: src/config/eventNames.js
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

const EVENT_NAMES = Object.freeze([
    "item.snapshot",
    "item.created",
    "item.updated",
    "sale.snapshot",
    "sale.update",
    "price.changed",
    "creator.trending",
    "featured.content.updated"
]);

const EVENT_NAME_SET = new Set(EVENT_NAMES);

function isValidEventName(name) {
    return EVENT_NAME_SET.has(String(name));
}

module.exports = {EVENT_NAMES, EVENT_NAME_SET, isValidEventName};
