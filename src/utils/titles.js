const fs   = require("fs");
const path = require("path");
const logger = require("../config/logger");

const file = path.join(__dirname, "../data/titles.json");

function loadTitles() {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        logger.warn("titles.json nicht gefunden → starte mit leerem Mapping.");
        return {};
    }
}

function resolveTitle(alias) {
    const titles = loadTitles();
    if (!titles[alias]) {
        const e = new Error(`Alias '${alias}' nicht gefunden.`);
        e.status = 404;
        throw e;
    }
    return titles[alias].id;
}

function saveTitles(titles) {
    fs.writeFileSync(file, JSON.stringify(titles, null, 2), "utf8");
}

module.exports = { loadTitles, saveTitles, resolveTitle };
