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
    let descriptor;
    try {
        descriptor = fs.openSync(file, "r");
        const stat = fs.fstatSync(descriptor);
        if (!titlesCache || stat.mtimeMs !== mtimeMs) {
            titlesCache = JSON.parse(fs.readFileSync(descriptor, "utf8"));
            mtimeMs = stat.mtimeMs;
        }
    } catch {
        if (!titlesCache) {
            logger.warn("titles.json not found → starting with an empty mapping table.");
            titlesCache = {};
        }
    } finally {
        if (typeof descriptor === "number") fs.closeSync(descriptor);
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
    if (!normalized || !Object.hasOwn(titles, normalized)) {
        const e = new Error(`Alias '${alias}' not found.`);
        e.status = 404;
        throw e;
    }
    const titleId = String(titles[normalized].id || "").trim();
    if (!/^[A-Za-z0-9]+$/.test(titleId)) {
        const e = new Error(`Alias '${alias}' has an invalid title id.`);
        e.status = 500;
        throw e;
    }
    return titleId;
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
