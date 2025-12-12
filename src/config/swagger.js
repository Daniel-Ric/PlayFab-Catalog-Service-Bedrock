const fs = require("fs");
const path = require("path");
const YAML = require("yamljs");

function loadYaml(filePath) {
    return YAML.load(filePath);
}

function loadDirYaml(acc, dir, mapper) {
    if (!fs.existsSync(dir)) return acc;
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
        .sort();
    for (const f of files) {
        const full = path.join(dir, f);
        const doc = loadYaml(full);
        acc = mapper(acc, doc);
    }
    return acc;
}

function normalizeServerUrl(v) {
    let s = String(v || "").trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    s = s.replace(/\/+$/, "");
    return s;
}

function applyServers(spec) {
    const envUrl = normalizeServerUrl(process.env.SWAGGER_SERVER_URL);
    if (envUrl) {
        spec.servers = [{url: envUrl}];
        return spec;
    }
    if (!Array.isArray(spec.servers) || spec.servers.length === 0) {
        const port = process.env.PORT || 3000;
        spec.servers = [{url: `http://localhost:${port}`}];
    }
    return spec;
}

function getOpenApiSpec() {
    const base = loadYaml(path.join(__dirname, "..", "docs", "openapi-base.yaml"));
    const spec = {...base};

    const schemasDir = path.join(__dirname, "..", "docs", "schemas");
    spec.components = spec.components || {};
    spec.components.schemas = spec.components.schemas || {};
    spec.components.schemas = loadDirYaml(spec.components.schemas, schemasDir, (acc, doc) => ({...acc, ...doc}));

    const pathsDir = path.join(__dirname, "..", "docs", "paths");
    spec.paths = spec.paths || {};
    spec.paths = loadDirYaml(spec.paths, pathsDir, (acc, doc) => ({...acc, ...doc}));

    return applyServers(spec);
}

module.exports = {getOpenApiSpec};
