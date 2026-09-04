// -----------------------------------------------------------------------------
//
// File: src/utils/catalogSanitizer.js
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

function readBooleanFlag(value) {
    return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function sensitiveCatalogFieldsEnabled(env = process.env) {
    return readBooleanFlag(env.EXPOSE_SENSITIVE_CATALOG_FIELDS);
}

function sensitiveEventFieldsEnabled(env = process.env) {
    return readBooleanFlag(env.EXPOSE_SENSITIVE_EVENT_FIELDS);
}

function canExposeSensitiveCatalogFields(user, env = process.env) {
    return sensitiveCatalogFieldsEnabled(env) && user?.role === "admin";
}

function requiresAdminForSensitiveFields(requestPath, env = process.env) {
    const path = String(requestPath || "").split("?", 1)[0];
    const isWithin = prefix => path === prefix || path.startsWith(`${prefix}/`);
    if (sensitiveCatalogFieldsEnabled(env) && isWithin("/marketplace")) return true;
    return sensitiveEventFieldsEnabled(env) && isWithin("/events");
}

function sanitizeValue(value, context, seen, exposeSensitive) {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
        const array = [];
        seen.set(value, array);
        for (const entry of value) array.push(sanitizeValue(entry, context, seen, exposeSensitive));
        return array;
    }

    const object = {};
    seen.set(value, object);
    for (const [key, entry] of Object.entries(value)) {
        const normalized = key.toLowerCase();
        const isSensitive = SENSITIVE_KEYS.has(normalized)
            || (context.inContents && (normalized === "url" || normalized === "key"));
        if (isSensitive && !exposeSensitive) {
            object[key] = null;
            continue;
        }
        object[key] = sanitizeValue(entry, {inContents: context.inContents || normalized === "contents"}, seen, exposeSensitive);
    }
    return object;
}

function sanitizeCatalogItem(item, options = {}) {
    if (!item || typeof item !== "object") return item;
    const exposeSensitive = options.exposeSensitive === true
        || (options.exposeSensitive === undefined && sensitiveCatalogFieldsEnabled(options.env));
    return sanitizeValue(item, {inContents: false}, new WeakMap(), exposeSensitive);
}

module.exports = {
    sanitizeCatalogItem,
    canExposeSensitiveCatalogFields,
    requiresAdminForSensitiveFields,
    sensitiveCatalogFieldsEnabled,
    sensitiveEventFieldsEnabled
};
