// -----------------------------------------------------------------------------
//
// File: src/utils/titles.js
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

function normalizeAlias(alias) {
    if (typeof alias !== "string") return "";
    return alias.trim().toLowerCase();
}

function resolveTitle(alias) {
    const titles = readTitlesFromDisk();
    const normalized = normalizeAlias(alias);
    if (!normalized || !titles[normalized]) {
        const e = new Error(`Alias '${alias}' not found.`);
        e.status = 404;
        throw e;
    }
    return titles[normalized].id;
}

function saveTitles(titles) {
    fs.writeFileSync(file, JSON.stringify(titles, null, 2), "utf8");
    titlesCache = titles;
    try {
        mtimeMs = fs.statSync(file).mtimeMs;
    } catch {
    }
}

module.exports = {loadTitles, saveTitles, resolveTitle};
