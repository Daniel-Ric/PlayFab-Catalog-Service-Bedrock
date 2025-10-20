const fs = require("fs");
const path = require("path");
const logger = require("../config/logger");

const file = path.join(__dirname, "../data/creators.json");

function normalizeName(v) {
    return String(v || "").toLowerCase().replace(/\s+/g, "");
}

function loadCreators() {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        logger.warn("creators.json not found or contains errors.");
        return [];
    }
}

function resolveCreatorId(creators, name) {
    const needle = normalizeName(name);
    const c = creators.find(c =>
        normalizeName(c.creatorName) === needle ||
        normalizeName(c.displayName) === needle
    );
    if (!c) {
        const e = new Error(`Creator '${name}' not found.`);
        e.status = 404;
        throw e;
    }
    return c.id;
}

module.exports = { loadCreators, resolveCreatorId };
