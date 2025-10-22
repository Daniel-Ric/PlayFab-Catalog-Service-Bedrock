const fs = require("fs");
const path = require("path");
const YAML = require("yamljs");

function deepMerge(target, source) {
    if (Array.isArray(target) && Array.isArray(source)) return [...target, ...source];
    if (typeof target === "object" && typeof source === "object" && target && source) {
        const out = {...target};
        for (const k of Object.keys(source)) {
            if (k in out) out[k] = deepMerge(out[k], source[k]);
            else out[k] = source[k];
        }
        return out;
    }
    return source;
}

function loadYaml(filePath) {
    return YAML.load(filePath);
}

function loadDirYaml(acc, dir, mapper) {
    if (!fs.existsSync(dir)) return acc;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
    for (const f of files) {
        const full = path.join(dir, f);
        const doc = loadYaml(full);
        acc = mapper(acc, doc);
    }
    return acc;
}

function getOpenApiSpec() {
    const base = loadYaml(path.join(__dirname, "..", "docs", "openapi-base.yaml"));

    let spec = {...base};

    const schemasDir = path.join(__dirname, "..", "docs", "schemas");
    spec.components = spec.components || {};
    spec.components.schemas = spec.components.schemas || {};
    spec.components.schemas = loadDirYaml(spec.components.schemas, schemasDir, (acc, doc) => ({...acc, ...doc}));

    const pathsDir = path.join(__dirname, "..", "docs", "paths");
    spec.paths = spec.paths || {};
    spec.paths = loadDirYaml(spec.paths, pathsDir, (acc, doc) => ({...acc, ...doc}));

    return spec;
}

module.exports = {getOpenApiSpec};
