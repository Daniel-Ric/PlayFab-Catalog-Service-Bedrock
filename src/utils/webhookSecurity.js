const net = require("net");

function isLoopbackOrPrivateIpv4(hostname) {
    const parts = hostname.split(".").map((part) => parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

    const [a, b] = parts;

    return a === 0
        || a === 10
        || a === 127
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168);
}

function isLoopbackOrPrivateIpv6(hostname) {
    const normalized = hostname.toLowerCase();
    return normalized === "::"
        || normalized === "::1"
        || normalized.startsWith("fc")
        || normalized.startsWith("fd")
        || normalized.startsWith("fe8")
        || normalized.startsWith("fe9")
        || normalized.startsWith("fea")
        || normalized.startsWith("feb");
}

function hostnameMatchesAllowedHost(hostname, allowedHost) {
    return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

function getAllowedWebhookHosts() {
    return String(process.env.WEBHOOK_ALLOWED_HOSTS || "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
}

function assertSafeWebhookUrl(input) {
    let parsed;

    try {
        parsed = new URL(String(input || "").trim());
    } catch {
        const error = new Error("Webhook URL is invalid.");
        error.status = 400;
        throw error;
    }

    if (parsed.protocol !== "https:") {
        const error = new Error("Webhook URL must use HTTPS.");
        error.status = 400;
        throw error;
    }

    if (parsed.username || parsed.password) {
        const error = new Error("Webhook URL must not include credentials.");
        error.status = 400;
        throw error;
    }

    const hostname = parsed.hostname.toLowerCase();
    const ipVersion = net.isIP(hostname);

    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
        const error = new Error("Webhook URL host is not allowed.");
        error.status = 400;
        throw error;
    }

    if ((ipVersion === 4 && isLoopbackOrPrivateIpv4(hostname)) || (ipVersion === 6 && isLoopbackOrPrivateIpv6(hostname))) {
        const error = new Error("Webhook URL host is not allowed.");
        error.status = 400;
        throw error;
    }

    const allowedHosts = getAllowedWebhookHosts();
    if (allowedHosts.length && !allowedHosts.some((allowedHost) => hostnameMatchesAllowedHost(hostname, allowedHost))) {
        const error = new Error("Webhook URL host is not allowed.");
        error.status = 400;
        throw error;
    }

    parsed.hash = "";
    return parsed.toString();
}

module.exports = {assertSafeWebhookUrl};
