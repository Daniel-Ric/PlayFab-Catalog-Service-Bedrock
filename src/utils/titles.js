const fs = require("fs");
const path = require("path");
const logger = require("../config/logger");

const file = path.join(__dirname, "../data/titles.json");

let titlesCache = null;
let mtimeMs = 0;

function readTitlesFromDisk() {
    try {
        const stat = fs.statSync(file);
        if (!titlesCache || stat.mtimeMs !== mtimeMs) {
            titlesCache = JSON.parse(fs.readFileSync(file, "utf8"));
            mtimeMs = stat.mtimeMs;
        }
    } catch {
        if (!titlesCache) {
            logger.warn("titles.json not found → starting with an empty mapping table.");
            titlesCache = {};
        }
    }
    return titlesCache;
}

function loadTitles() {
    return readTitlesFromDisk();
}

function resolveTitle(alias) {
    const titles = readTitlesFromDisk();
    if (!titles[alias]) {
        const e = new Error(`Alias '${alias}' not found.`);
        e.status = 404;
        throw e;
    }
    return titles[alias].id;
}

function saveTitles(titles) {
    fs.writeFileSync(file, JSON.stringify(titles, null, 2), "utf8");
    titlesCache = titles;
    try {
        mtimeMs = fs.statSync(file).mtimeMs;
    } catch {}
}

module.exports = { loadTitles, saveTitles, resolveTitle };
