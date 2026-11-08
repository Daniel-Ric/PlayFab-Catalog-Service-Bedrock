function parseRetryAfter(value, now = Date.now()) {
    if (value == null || String(value).trim() === "") return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1000));
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

function retryAfterMs(response, now = Date.now()) {
    if (![429, 503].includes(Number(response?.status))) return null;
    const header = parseRetryAfter(response?.headers?.["retry-after"], now);
    const value = response?.data?.retryAfterSeconds;
    const seconds = value == null || String(value).trim() === "" ? NaN : Number(value);
    const body = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds * 1000)) : null;
    if (header === null) return body;
    return body === null ? header : Math.max(header, body);
}

module.exports = {parseRetryAfter, retryAfterMs};
