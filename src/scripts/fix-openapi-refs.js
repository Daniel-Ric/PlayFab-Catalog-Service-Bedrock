// -----------------------------------------------------------------------------
//
// File: src/scripts/fix-openapi-refs.js
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
const YAML = require("yamljs");

function listYamlFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) return listYamlFiles(p);
        if (/\.(ya?ml)$/i.test(d.name)) return [p];
        return [];
    });
}

function findDocsRoot() {
    const here = process.cwd();
    const hereDir = __dirname;
    const candidates = [
        path.join(here, "src", "docs"),
        path.join(here, "docs"),
        path.join(hereDir, "..", "docs"),
        path.join(hereDir, "..", "..", "docs"),
        path.join(hereDir, "..", "..", "src", "docs")
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, "schemas"))) return c;
    }
    return null;
}

function buildSchemaNameMap(schemasDir) {
    const files = listYamlFiles(schemasDir);
    const map = new Map();
    for (const f of files) {
        try {
            const doc = YAML.load(f);
            if (doc && typeof doc === "object") {
                for (const k of Object.keys(doc)) {
                    if (k && typeof k === "string") map.set(k.toLowerCase(), k);
                }
            }
        } catch {}
    }
    return map;
}

function normRef(ref, map) {
    if (!ref || typeof ref !== "string") return ref;
    const m = ref.match(/^#\/components\/schemas\/(.+)$/);
    if (!m) return ref;
    let name = m[1];
    if (/\.ya?ml$/i.test(name)) name = name.replace(/\.ya?ml$/i, "");
    const mapped = map.get(name.toLowerCase()) || name;
    return `#/components/schemas/${mapped}`;
}

function ensureTypeForNullable(node) {
    if (node && node.nullable === true && typeof node.type === "undefined" && !node.$ref && !node.oneOf && !node.anyOf && !node.allOf) {
        if (node.properties || node.additionalProperties) node.type = "object";
        else if (node.items) node.type = "array";
        else if (node.enum || node.format || node.pattern) node.type = "string";
        else node.type = "string";
        return true;
    }
    return false;
}

function fixNode(node, map) {
    if (!node || typeof node !== "object") return false;
    let changed = false;

    if (node.$ref) {
        const n = normRef(node.$ref, map);
        if (n !== node.$ref) { node.$ref = n; changed = true; }
    }

    if (node.type === "null") {
        delete node.type;
        node.type = "string";
        node.nullable = true;
        changed = true;
    }

    if (node.oneOf && Array.isArray(node.oneOf)) {
        const arr = node.oneOf;
        if (arr.length === 2) {
            const a = arr[0], b = arr[1];
            const isNullB = b && typeof b === "object" && b.type === "null";
            const isNullA = a && typeof a === "object" && a.type === "null";
            if ((a && a.$ref && isNullB) || (b && b.$ref && isNullA)) {
                const refObj = a.$ref ? a : b;
                node.anyOf = [
                    { $ref: normRef(refObj.$ref, map) },
                    { type: "object", nullable: true, additionalProperties: true }
                ];
                delete node.oneOf;
                changed = true;
            }
        }
    }

    if (ensureTypeForNullable(node)) changed = true;

    for (const k of Object.keys(node)) {
        const v = node[k];
        if (Array.isArray(v)) {
            for (const it of v) if (fixNode(it, map)) changed = true;
        } else if (v && typeof v === "object") {
            if (fixNode(v, map)) changed = true;
        }
    }

    return changed;
}

function processFile(file, map) {
    let obj;
    try { obj = YAML.load(file); } catch { return false; }
    const changed = fixNode(obj, map);
    if (changed) {
        const out = YAML.stringify(obj, 4);
        fs.writeFileSync(file, out, "utf8");
    }
    return changed;
}

function run() {
    const docsRoot = findDocsRoot();
    if (!docsRoot) { console.error("Could not locate 'docs' root containing a 'schemas' directory."); process.exit(1); }

    const schemaMap = buildSchemaNameMap(path.join(docsRoot, "schemas"));
    if (schemaMap.size === 0) { console.error("No schemas found"); process.exit(1); }

    const files = listYamlFiles(docsRoot);
    let n = 0;
    for (const f of files) if (processFile(f, schemaMap)) { console.log(`fixed: ${path.relative(process.cwd(), f)}`); n++; }

    console.log(`Done. Updated ${n} file(s).`);
}

run();
