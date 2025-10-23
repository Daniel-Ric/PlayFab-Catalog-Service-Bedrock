const crypto = require("crypto");

function stableStringify(obj) {
    if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",")}}`;
}

function stableHash(obj) {
    const s = typeof obj === "string" ? obj : stableStringify(obj);
    return crypto.createHash("sha1").update(s).digest("hex");
}

module.exports = {stableHash};
