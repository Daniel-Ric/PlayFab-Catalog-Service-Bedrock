// -----------------------------------------------------------------------------
//
// File: src/utils/webhookTarget.js
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

const dns = require("node:dns").promises;
const net = require("node:net");

function createWebhookTargetError(message) {
    const error = new Error(message);
    error.status = 400;
    error.publicMessage = message;
    return error;
}

function normalizeHostname(hostname) {
    return String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

function isBlockedHostname(hostname) {
    const normalized = normalizeHostname(hostname);
    if (!normalized) return true;
    if (normalized === "localhost") return true;
    return [".localhost", ".local", ".internal", ".home", ".lan"].some((suffix) => normalized.endsWith(suffix));
}

function isPrivateIpv4(ip) {
    const parts = ip.split(".").map((part) => parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
}

function isPrivateIpv6(ip) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("ff")) return true;
    return false;
}

function isPrivateIp(ip) {
    const family = net.isIP(ip);
    if (family === 4) return isPrivateIpv4(ip);
    if (family === 6) return isPrivateIpv6(ip);
    return true;
}

function parseWebhookUrl(value) {
    let parsed;
    try {
        parsed = new URL(String(value || "").trim());
    } catch {
        throw createWebhookTargetError("Webhook URL must be a valid absolute URL.");
    }

    if (!["https:", "http:"].includes(parsed.protocol)) {
        throw createWebhookTargetError("Webhook URL must use HTTP or HTTPS.");
    }

    if (!parsed.hostname) {
        throw createWebhookTargetError("Webhook URL must include a hostname.");
    }

    if (parsed.username || parsed.password) {
        throw createWebhookTargetError("Webhook URL must not contain embedded credentials.");
    }

    const hostname = normalizeHostname(parsed.hostname);
    if (isBlockedHostname(hostname)) {
        throw createWebhookTargetError("Webhook URL host is not allowed.");
    }

    if (net.isIP(hostname) && isPrivateIp(hostname)) {
        throw createWebhookTargetError("Webhook URL must not target a private or local IP address.");
    }

    return parsed;
}

async function assertSafeWebhookUrl(value, options = {}) {
    const parsed = parseWebhookUrl(value);
    const hostname = normalizeHostname(parsed.hostname);
    const lookup = options.lookup || dns.lookup;

    if (!net.isIP(hostname)) {
        let records;
        try {
            records = await lookup(hostname, {all: true, verbatim: true});
        } catch {
            throw createWebhookTargetError("Webhook URL hostname could not be resolved.");
        }

        if (!Array.isArray(records) || !records.length) {
            throw createWebhookTargetError("Webhook URL hostname could not be resolved.");
        }

        for (const record of records) {
            if (!record || !record.address || isPrivateIp(record.address)) {
                throw createWebhookTargetError("Webhook URL must not resolve to a private or local IP address.");
            }
        }
    }

    parsed.hash = "";
    return parsed.toString();
}

module.exports = {
    assertSafeWebhookUrl,
    isPrivateIp,
    parseWebhookUrl,
};
