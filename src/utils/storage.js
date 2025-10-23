const fs = require("fs");
const path = require("path");

function ensureDir(p) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
}

function readJson(p, fallback) {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
}

function writeJsonAtomic(p, obj) {
    ensureDir(p);
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    fs.renameSync(tmp, p);
}

module.exports = {readJson, writeJsonAtomic};
