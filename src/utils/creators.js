const fs = require("fs");
const path = require("path");
const logger = require("../config/logger");

const file = path.join(__dirname, "../data/creators.json");

function loadCreators() {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        logger.warn("creators.json not found or contains errors.");
        return [];
    }
}

function resolveCreatorId(creators, name) {
    const c = creators.find(c =>
        c.creatorName === name || c.displayName === name
    );
    if (!c) {
        const e = new Error(`Creator '${name}' not found.`);
        e.status = 404;
        throw e;
    }
    return c.id;
}

module.exports = { loadCreators, resolveCreatorId };
