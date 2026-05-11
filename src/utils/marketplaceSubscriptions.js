// -----------------------------------------------------------------------------
//
// File: src/utils/marketplaceSubscriptions.js
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

const SUBSCRIPTION_DEFS = Object.freeze({
    marketplacePass: {
        key: "marketplacePass",
        eventKey: "marketplace.pass",
        label: "Marketplace Pass",
        tag: "csb",
        startField: "csbStartDate",
        endField: "csbEndDate"
    },
    realmsPlus: {
        key: "realmsPlus",
        eventKey: "realms.plus",
        label: "Realms Plus",
        tag: "realms_plus",
        startField: "realmsPlusStartDate",
        endField: "realmsPlusEndDate"
    }
});

function normalizeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

function hasTag(item, tag) {
    return (Array.isArray(item?.Tags) ? item.Tags : []).some(value => String(value).toLowerCase() === tag);
}

function getSubscriptionWindow(item, subscriptionKey) {
    const def = SUBSCRIPTION_DEFS[subscriptionKey];
    if (!def) return {startDate: null, endDate: null};
    const dp = item?.DisplayProperties || {};
    return {
        startDate: normalizeDate(dp[def.startField]),
        endDate: normalizeDate(dp[def.endField])
    };
}

function getItemSubscriptionInfo(item, subscriptionKey) {
    const def = SUBSCRIPTION_DEFS[subscriptionKey];
    if (!def) return null;
    return {
        key: def.key,
        label: def.label,
        tag: def.tag,
        active: hasTag(item, def.tag),
        ...getSubscriptionWindow(item, subscriptionKey)
    };
}

function getSubscriptionIds(items) {
    const ids = {};
    for (const key of Object.keys(SUBSCRIPTION_DEFS)) {
        const def = SUBSCRIPTION_DEFS[key];
        ids[key] = new Set();
        for (const item of items || []) {
            const id = item?.Id || item?.id;
            if (id && hasTag(item, def.tag)) ids[key].add(id);
        }
    }
    return ids;
}

function subscriptionEventName(subscriptionKey, action) {
    const def = SUBSCRIPTION_DEFS[subscriptionKey];
    return def ? `${def.eventKey}.${action}` : "";
}

function subscriptionFilter(subscriptionKey) {
    const def = SUBSCRIPTION_DEFS[subscriptionKey];
    if (!def) return "";
    return `tags/any(t:t eq '${def.tag.replace(/'/g, "''")}')`;
}

module.exports = {
    SUBSCRIPTION_DEFS,
    getItemSubscriptionInfo,
    getSubscriptionIds,
    hasTag,
    subscriptionEventName,
    subscriptionFilter
};
