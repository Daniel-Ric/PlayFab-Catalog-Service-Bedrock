// -----------------------------------------------------------------------------
//
// File: src/utils/catalogSanitizer.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
//
// -----------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
    "authorization",
    "contentkey",
    "encryptedrequest",
    "entitytoken",
    "playersecret",
    "sessionticket",
    "titlesharedsecret",
    "token"
]);

function sanitizeValue(value, context, seen) {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
        const array = [];
        seen.set(value, array);
        for (const entry of value) array.push(sanitizeValue(entry, context, seen));
        return array;
    }

    const object = {};
    seen.set(value, object);
    for (const [key, entry] of Object.entries(value)) {
        const normalized = key.toLowerCase();
        if (SENSITIVE_KEYS.has(normalized)) continue;
        if (context.inContents && (normalized === "url" || normalized === "key")) continue;
        object[key] = sanitizeValue(entry, {inContents: context.inContents || normalized === "contents"}, seen);
    }
    return object;
}

function sanitizeCatalogItem(item) {
    if (!item || typeof item !== "object") return item;
    return sanitizeValue(item, {inContents: false}, new WeakMap());
}

module.exports = {sanitizeCatalogItem};
