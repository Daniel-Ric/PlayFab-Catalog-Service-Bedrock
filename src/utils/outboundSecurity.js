function assertPlayFabTitleId(titleId) {
    const value = String(titleId || "").trim();
    if (!/^[A-Za-z0-9]{4,10}$/.test(value)) {
        const error = new Error("Invalid title ID.");
        error.status = 400;
        throw error;
    }
    return value;
}

function assertPlayFabEndpoint(endpoint) {
    const value = String(endpoint || "").trim();
    if (!/^[A-Za-z]+(?:\/[A-Za-z]+)+$/.test(value)) {
        const error = new Error("Invalid PlayFab endpoint.");
        error.status = 400;
        throw error;
    }
    return value;
}

function buildPlayFabUrl(titleId, endpoint) {
    return `https://${assertPlayFabTitleId(titleId)}.playfabapi.com/${assertPlayFabEndpoint(endpoint)}`;
}

function normalizeHttpsUrl(input, allowedHosts = []) {
    let parsed;

    try {
        parsed = new URL(String(input || "").trim());
    } catch {
        const error = new Error("Invalid outbound URL.");
        error.status = 500;
        throw error;
    }

    if (parsed.protocol !== "https:") {
        const error = new Error("Outbound URL must use HTTPS.");
        error.status = 500;
        throw error;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (allowedHosts.length && !allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`))) {
        const error = new Error("Outbound URL host is not allowed.");
        error.status = 500;
        throw error;
    }

    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    return parsed.toString();
}

function joinUrl(baseUrl, pathname) {
    const parsed = new URL(String(baseUrl || ""));
    parsed.pathname = pathname;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
}

module.exports = {assertPlayFabTitleId, assertPlayFabEndpoint, buildPlayFabUrl, normalizeHttpsUrl, joinUrl};
