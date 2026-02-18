// -----------------------------------------------------------------------------
//
// File: src/scripts/setup.js
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
const crypto = require("crypto");
const prompts = require("prompts");
const chalkImport = require("chalk");
const chalk = chalkImport.default || chalkImport;

const BRAND_NAME = "PlayFab Catalog Bedrock API";
const BRAND_BY = "SpindexGFX";
const BRAND_ACCENT = chalk.cyan;
const BRAND_DIM = chalk.gray;
const BRAND_TEXT = chalk.white;
const BRAND_WARN = chalk.yellow;
const BRAND_ERROR = chalk.red;
const BRAND_OK = chalk.green;

function genSecret(bytes = 48) {
    return crypto.randomBytes(bytes).toString("hex");
}

function fileExists(p) {
    try {
        fs.accessSync(p, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

function ensureDirForFile(p) {
    const dir = path.dirname(p);
    if (!fileExists(dir)) fs.mkdirSync(dir, {recursive: true});
}

function loadEnvFile(envPath) {
    const out = {};
    if (!fileExists(envPath)) return out;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = line.indexOf("=");
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        out[key] = val;
    }
    return out;
}

function writeEnvFile(envPath, cfg) {
    const lines = [`PORT=${cfg.PORT}`, `NODE_ENV=${cfg.NODE_ENV}`, `DEFAULT_ALIAS=${cfg.DEFAULT_ALIAS}`, `FEATURED_PRIMARY_ALIAS=${cfg.FEATURED_PRIMARY_ALIAS}`, `TITLE_ID=${cfg.TITLE_ID}`, `OS=${cfg.OS}`, `TRUST_PROXY=${cfg.TRUST_PROXY}`, `LOG_LEVEL=${cfg.LOG_LEVEL}`, `JWT_SECRET=${cfg.JWT_SECRET}`, `ADMIN_USER=${cfg.ADMIN_USER}`, `ADMIN_PASS=${cfg.ADMIN_PASS}`, `CORS_ORIGINS=${cfg.CORS_ORIGINS}`, `HTTP_MAX_SOCKETS=${cfg.HTTP_MAX_SOCKETS}`, `HTTPS_MAX_SOCKETS=${cfg.HTTPS_MAX_SOCKETS}`, `UPSTREAM_TIMEOUT_MS=${cfg.UPSTREAM_TIMEOUT_MS}`, `RETRY_BUDGET=${cfg.RETRY_BUDGET}`, `SESSION_TTL_MS=${cfg.SESSION_TTL_MS}`, `SESSION_CACHE_MAX=${cfg.SESSION_CACHE_MAX}`, `DATA_CACHE_MAX=${cfg.DATA_CACHE_MAX}`, `DATA_TTL_MS=${cfg.DATA_TTL_MS}`, `MULTILANG_ALL=${cfg.MULTILANG_ALL}`, `MULTILANG_ENRICH_BATCH=${cfg.MULTILANG_ENRICH_BATCH}`, `MULTILANG_ENRICH_CONCURRENCY=${cfg.MULTILANG_ENRICH_CONCURRENCY}`, `STORE_CONCURRENCY=${cfg.STORE_CONCURRENCY}`, `STORE_MAX_FOR_PRICE_ENRICH=${cfg.STORE_MAX_FOR_PRICE_ENRICH}`, `VALIDATE_REQUESTS=${cfg.VALIDATE_REQUESTS}`, `VALIDATE_RESPONSES=${cfg.VALIDATE_RESPONSES}`, `ENABLE_DOCS=${cfg.ENABLE_DOCS}`, `PAGE_SIZE=${cfg.PAGE_SIZE}`, `REVIEWS_ENABLED=${cfg.REVIEWS_ENABLED}`, `REVIEWS_FETCH_COUNT=${cfg.REVIEWS_FETCH_COUNT}`, `ENABLE_SALES_WATCHER=${cfg.ENABLE_SALES_WATCHER}`, `SALES_WATCH_INTERVAL_MS=${cfg.SALES_WATCH_INTERVAL_MS}`, `ENABLE_ITEM_WATCHER=${cfg.ENABLE_ITEM_WATCHER}`, `ITEM_WATCH_INTERVAL_MS=${cfg.ITEM_WATCH_INTERVAL_MS}`, `ITEM_WATCH_TOP=${cfg.ITEM_WATCH_TOP}`, `ITEM_WATCH_PAGES=${cfg.ITEM_WATCH_PAGES}`, `ENABLE_PRICE_WATCHER=${cfg.ENABLE_PRICE_WATCHER}`, `PRICE_WATCH_INTERVAL_MS=${cfg.PRICE_WATCH_INTERVAL_MS}`, `PRICE_WATCH_MAX_STORES=${cfg.PRICE_WATCH_MAX_STORES}`, `ENABLE_TRENDING_WATCHER=${cfg.ENABLE_TRENDING_WATCHER}`, `TRENDING_INTERVAL_MS=${cfg.TRENDING_INTERVAL_MS}`, `TRENDING_WINDOW_HOURS=${cfg.TRENDING_WINDOW_HOURS}`, `TRENDING_PAGE_TOP=${cfg.TRENDING_PAGE_TOP}`, `TRENDING_PAGES=${cfg.TRENDING_PAGES}`, `TRENDING_TOP_N=${cfg.TRENDING_TOP_N}`, `ENABLE_FEATURED_CONTENT_WATCHER=${cfg.ENABLE_FEATURED_CONTENT_WATCHER}`, `FEATURED_CONTENT_WATCH_INTERVAL_MS=${cfg.FEATURED_CONTENT_WATCH_INTERVAL_MS}`, `ADV_SEARCH_TTL_MS=${cfg.ADV_SEARCH_TTL_MS}`, `ADV_SEARCH_BATCH=${cfg.ADV_SEARCH_BATCH}`, `ADV_SEARCH_MAX_BATCHES=${cfg.ADV_SEARCH_MAX_BATCHES}`, `MAX_SEARCH_BATCHES=${cfg.MAX_SEARCH_BATCHES}`, `MAX_FETCH_BATCHES=${cfg.MAX_FETCH_BATCHES}`, `PLAYFAB_CONCURRENCY=${cfg.PLAYFAB_CONCURRENCY}`, `PLAYFAB_BATCH=${cfg.PLAYFAB_BATCH}`];
    fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
}

function ensureDataFiles(rootDir, cfg) {
    const dataDir = path.join(rootDir, "src", "data");
    if (!fileExists(dataDir)) fs.mkdirSync(dataDir, {recursive: true});

    const titlesPath = path.join(dataDir, "titles.json");
    if (!fileExists(titlesPath)) {
        const obj = {};
        obj[cfg.DEFAULT_ALIAS] = {
            id: cfg.TITLE_ID, notes: "Configured via setup CLI"
        };
        fs.writeFileSync(titlesPath, JSON.stringify(obj, null, 2), "utf8");
    }

    const creatorsPath = path.join(dataDir, "creators.json");
    if (!fileExists(creatorsPath)) {
        fs.writeFileSync(creatorsPath, "[]\n", "utf8");
    }
}

function ensureGitignoreEntries(gitignorePath, entries) {
    if (!fileExists(gitignorePath)) return;
    const raw = fs.readFileSync(gitignorePath, "utf8").split(/\r?\n/);
    let changed = false;
    for (const e of entries) {
        if (!raw.includes(e)) {
            raw.push(e);
            changed = true;
        }
    }
    if (changed) {
        fs.writeFileSync(gitignorePath, raw.join("\n") + "\n", "utf8");
    }
}

function line(w = 60) {
    return "─".repeat(w);
}

function stripAnsiLen(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function frameBox(title, subtitleLines) {
    const contentLines = [];
    contentLines.push(BRAND_ACCENT.bold(title));
    for (const s of subtitleLines) contentLines.push(BRAND_DIM(s));

    let boxWidth = 0;
    for (const l of contentLines) {
        const len = stripAnsiLen(l);
        if (len + 4 > boxWidth) boxWidth = len + 4;
    }
    if (boxWidth < 50) boxWidth = 50;

    const top = "┌" + "─".repeat(boxWidth - 2) + "┐";
    const bottom = "└" + "─".repeat(boxWidth - 2) + "┘";

    const padLine = txt => {
        const rawLen = stripAnsiLen(txt);
        const pad = boxWidth - 2 - rawLen;
        return "│ " + txt + " ".repeat(Math.max(0, pad - 1)) + "│";
    };

    console.log(BRAND_TEXT.bold(top));
    for (const l of contentLines) {
        console.log(BRAND_TEXT.bold(padLine(l)));
    }
    console.log(BRAND_TEXT.bold(bottom));
}

function screenHeader(sectionTitle, sectionDesc) {
    console.log(BRAND_TEXT.bold(line()));
    console.log(BRAND_TEXT.bold("[") + BRAND_ACCENT.bold(sectionTitle) + BRAND_TEXT.bold("]"));
    if (sectionDesc) {
        console.log(BRAND_DIM(sectionDesc));
    }
    console.log(BRAND_TEXT.bold(line()));
    console.log("");
}

function screenLines(linesArr) {
    for (const ln of linesArr) {
        console.log(ln === "" ? "" : BRAND_DIM(ln));
    }
    console.log("");
}

async function pageSecurity(baseCfg) {
    console.clear();
    frameBox(BRAND_NAME + " Setup", ["Interactive setup wizard", "by " + BRAND_BY, "", "Step 1/4: Security / Access", "Configure admin credentials for protected routes."]);
    console.log("");

    screenHeader("Security / Access", "These credentials are required for protected admin endpoints like /marketplace/* and /health.");

    screenLines(["Keep them private. You will need them to manage this instance."]);

    const qAdminRaw = await prompts([{
        type: "text",
        name: "ADMIN_USER",
        message: BRAND_TEXT("Admin username"),
        initial: baseCfg.ADMIN_USER || "admin",
        validate: v => (v && v.trim().length > 0 ? true : "Required")
    }, {
        type: "password",
        name: "ADMIN_PASS",
        message: BRAND_TEXT("Admin password (leave empty to keep current or auto-generate)"),
        initial: "",
        validate: () => true
    }], {
        onCancel() {
            console.log(BRAND_ERROR("Setup aborted."));
            process.exit(1);
        }
    });

    return qAdminRaw;
}

async function pageRuntime(baseCfg) {
    console.clear();
    frameBox(BRAND_NAME + " Setup", ["Step 2/4: Runtime / Network", "Control how and where the API listens and how it logs."]);
    console.log("");

    screenHeader("Runtime / Network", "Port, production/dev mode, reverse proxy trust, log level and CORS.");

    screenLines(["CORS_ORIGINS lets browsers call this API.", "Example: https://my-dashboard.example.com,https://internal.example.org", "Leave blank to disable browser access."]);

    const qRuntime = await prompts([{
        type: "text",
        name: "PORT",
        message: BRAND_TEXT("HTTP port the API will listen on"),
        initial: baseCfg.PORT || "3000",
        validate: v => (/^\d+$/.test(v) ? true : "Must be a number")
    }, {
        type: "select",
        name: "NODE_ENV",
        message: BRAND_TEXT("Node environment"),
        initial: (baseCfg.NODE_ENV || "production") === "production" ? 0 : 1,
        choices: [{
            title: BRAND_TEXT("production (recommended)"), value: "production"
        }, {title: BRAND_TEXT("development (verbose, not hardened)"), value: "development"}]
    }, {
        type: "select",
        name: "TRUST_PROXY",
        message: BRAND_TEXT("Behind reverse proxy / load balancer?"),
        initial: (baseCfg.TRUST_PROXY || "1") === "1" ? 0 : 1,
        choices: [{title: BRAND_TEXT("yes (1)"), value: "1"}, {title: BRAND_TEXT("no (false)"), value: "false"}]
    }, {
        type: "select",
        name: "LOG_LEVEL",
        message: BRAND_TEXT("Log level"),
        initial: (baseCfg.LOG_LEVEL || "info") === "info" ? 0 : 1,
        choices: [{title: BRAND_TEXT("info  (normal)"), value: "info"}, {
            title: BRAND_TEXT("debug (very noisy)"), value: "debug"
        }]
    }, {
        type: "text",
        name: "CORS_ORIGINS",
        message: BRAND_TEXT("Allowed CORS origins (comma separated, empty = disabled)"),
        initial: baseCfg.CORS_ORIGINS || ""
    }], {
        onCancel() {
            console.log(BRAND_ERROR("Setup aborted."));
            process.exit(1);
        }
    });

    return qRuntime;
}

async function pageValidation(baseCfg) {
    console.clear();
    frameBox(BRAND_NAME + " Setup", ["Step 3/4: Validation / Docs", "Enable Swagger UI and OpenAPI validation."]);
    console.log("");

    screenHeader("Validation / Docs", "Strict validation can block bad requests and catch server bugs. Swagger UI helps developers explore the API.");

    screenLines(["Swagger UI (/docs) should normally be disabled on public production instances.", "Validation adds runtime overhead but is useful during development."]);

    const qDocs = await prompts([{
        type: "toggle",
        name: "ENABLE_DOCS",
        message: BRAND_TEXT("Expose interactive API docs at /docs?"),
        initial: (baseCfg.ENABLE_DOCS || "false") === "true",
        active: "yes",
        inactive: "no"
    }, {
        type: "toggle",
        name: "VALIDATE_REQUESTS",
        message: BRAND_TEXT("Validate incoming requests against OpenAPI spec?"),
        initial: (baseCfg.VALIDATE_REQUESTS || "false") === "true",
        active: "yes",
        inactive: "no"
    }, {
        type: "toggle",
        name: "VALIDATE_RESPONSES",
        message: BRAND_TEXT("Validate server responses against OpenAPI spec?"),
        initial: (baseCfg.VALIDATE_RESPONSES || "false") === "true",
        active: "yes",
        inactive: "no"
    }], {
        onCancel() {
            console.log(BRAND_ERROR("Setup aborted."));
            process.exit(1);
        }
    });

    return qDocs;
}

async function pageWatchers(baseCfg) {
    console.clear();
    frameBox(BRAND_NAME + " Setup", ["Step 4/4: Background Watchers", "Automated discovery of sales, new items, price changes and trending content."]);
    console.log("");

    screenHeader("Background Watchers", "These background tasks continuously poll PlayFab and generate market intel.");

    screenLines(["Watchers periodically poll PlayFab in the background to keep marketplace data fresh."]);

    const qWatchers = await prompts([{
        type: "toggle",
        name: "ENABLE_SALES_WATCHER",
        message: BRAND_TEXT("Enable Sales Watcher (track discounted items)"),
        initial: (baseCfg.ENABLE_SALES_WATCHER || "true") === "true",
        active: "yes",
        inactive: "no"
    }, {
        type: "toggle",
        name: "ENABLE_ITEM_WATCHER",
        message: BRAND_TEXT("Enable Item Watcher (track newly published content)"),
        initial: (baseCfg.ENABLE_ITEM_WATCHER || "true") === "true",
        active: "yes",
        inactive: "no"
    }, {
        type: "toggle",
        name: "ENABLE_PRICE_WATCHER",
        message: BRAND_TEXT("Enable Price Watcher (track price changes across stores)"),
        initial: (baseCfg.ENABLE_PRICE_WATCHER || "true") === "true",
        active: "yes",
        inactive: "no"
    }, {
        type: "toggle",
        name: "ENABLE_TRENDING_WATCHER",
        message: BRAND_TEXT("Enable Trending Watcher (track what's hot right now)"),
        initial: (baseCfg.ENABLE_TRENDING_WATCHER || "true") === "true",
        active: "yes",
        inactive: "no"
    }, {
        type: "toggle",
        name: "ENABLE_FEATURED_CONTENT_WATCHER",
        message: BRAND_TEXT("Enable Featured Content Watcher (track weekly featured rotations)"),
        initial: (baseCfg.ENABLE_FEATURED_CONTENT_WATCHER || "true") === "true",
        active: "yes",
        inactive: "no"
    }], {
        onCancel() {
            console.log(BRAND_ERROR("Setup aborted."));
            process.exit(1);
        }
    });

    return qWatchers;
}

function summaryIdentity(out) {
    console.clear();
    frameBox(BRAND_NAME + " Setup", ["Summary", "Internal identity (read only)"]);
    console.log("");

    screenHeader("Service Identity (read only)", "These values define how the API talks to PlayFab and how content is grouped.");

    const rows = [["DEFAULT_ALIAS", out.DEFAULT_ALIAS], ["FEATURED_PRIMARY_ALIAS", out.FEATURED_PRIMARY_ALIAS], ["TITLE_ID", out.TITLE_ID], ["OS", out.OS]];

    const pad = 28;
    console.log(BRAND_TEXT.bold(line()));
    for (const [label, value] of rows) {
        const l = (label + ":").padEnd(pad, " ");
        console.log(BRAND_TEXT(l) + BRAND_ACCENT(value));
    }
    console.log(BRAND_TEXT.bold(line()));
    console.log("");

    console.log(BRAND_DIM("These are considered stable defaults. Do not change them unless you fully understand the internal workflow."));
    console.log("");
}

function askConfig(baseCfg) {
    return (async () => {
        const qAdminRaw = await pageSecurity(baseCfg);
        const qRuntime = await pageRuntime(baseCfg);
        const qDocs = await pageValidation(baseCfg);
        const qWatchers = await pageWatchers(baseCfg);

        const adminUserInput = typeof qAdminRaw.ADMIN_USER === "string" ? qAdminRaw.ADMIN_USER.trim() : "";

        const finalAdminUser = adminUserInput.length ? adminUserInput : baseCfg.ADMIN_USER && baseCfg.ADMIN_USER.trim().length ? baseCfg.ADMIN_USER.trim() : "admin";

        const finalAdminPass = genSecret(12);

        const jwtSecret = genSecret(48);

        const out = {
            PORT: qRuntime.PORT,
            NODE_ENV: qRuntime.NODE_ENV,
            DEFAULT_ALIAS: baseCfg.DEFAULT_ALIAS || "prod",
            FEATURED_PRIMARY_ALIAS: baseCfg.FEATURED_PRIMARY_ALIAS || baseCfg.DEFAULT_ALIAS || "prod",
            TITLE_ID: baseCfg.TITLE_ID || "20CA2",
            OS: baseCfg.OS || "iOS",
            TRUST_PROXY: qRuntime.TRUST_PROXY,
            LOG_LEVEL: qRuntime.LOG_LEVEL,
            JWT_SECRET: jwtSecret,
            ADMIN_USER: finalAdminUser,
            ADMIN_PASS: finalAdminPass,
            CORS_ORIGINS: qRuntime.CORS_ORIGINS || "",
            HTTP_MAX_SOCKETS: baseCfg.HTTP_MAX_SOCKETS || "512",
            HTTPS_MAX_SOCKETS: baseCfg.HTTPS_MAX_SOCKETS || "512",
            UPSTREAM_TIMEOUT_MS: baseCfg.UPSTREAM_TIMEOUT_MS || "20000",
            RETRY_BUDGET: baseCfg.RETRY_BUDGET || "3",
            SESSION_TTL_MS: baseCfg.SESSION_TTL_MS || "1800000",
            SESSION_CACHE_MAX: baseCfg.SESSION_CACHE_MAX || "1000",
            DATA_CACHE_MAX: baseCfg.DATA_CACHE_MAX || "20000",
            DATA_TTL_MS: baseCfg.DATA_TTL_MS || "300000",
            MULTILANG_ALL: baseCfg.MULTILANG_ALL || "true",
            MULTILANG_ENRICH_BATCH: baseCfg.MULTILANG_ENRICH_BATCH || "100",
            MULTILANG_ENRICH_CONCURRENCY: baseCfg.MULTILANG_ENRICH_CONCURRENCY || "5",
            STORE_CONCURRENCY: baseCfg.STORE_CONCURRENCY || "6",
            STORE_MAX_FOR_PRICE_ENRICH: baseCfg.STORE_MAX_FOR_PRICE_ENRICH || "500",
            VALIDATE_REQUESTS: qDocs.VALIDATE_REQUESTS ? "true" : "false",
            VALIDATE_RESPONSES: qDocs.VALIDATE_RESPONSES ? "true" : "false",
            ENABLE_DOCS: qDocs.ENABLE_DOCS ? "true" : "false",
            PAGE_SIZE: baseCfg.PAGE_SIZE || "100",
            REVIEWS_ENABLED: baseCfg.REVIEWS_ENABLED || "true",
            REVIEWS_FETCH_COUNT: baseCfg.REVIEWS_FETCH_COUNT || "20",
            ENABLE_SALES_WATCHER: qWatchers.ENABLE_SALES_WATCHER ? "true" : "false",
            SALES_WATCH_INTERVAL_MS: baseCfg.SALES_WATCH_INTERVAL_MS || "30000",
            ENABLE_ITEM_WATCHER: qWatchers.ENABLE_ITEM_WATCHER ? "true" : "false",
            ITEM_WATCH_INTERVAL_MS: baseCfg.ITEM_WATCH_INTERVAL_MS || "30000",
            ITEM_WATCH_TOP: baseCfg.ITEM_WATCH_TOP || "150",
            ITEM_WATCH_PAGES: baseCfg.ITEM_WATCH_PAGES || "3",
            ENABLE_PRICE_WATCHER: qWatchers.ENABLE_PRICE_WATCHER ? "true" : "false",
            PRICE_WATCH_INTERVAL_MS: baseCfg.PRICE_WATCH_INTERVAL_MS || "30000",
            PRICE_WATCH_MAX_STORES: baseCfg.PRICE_WATCH_MAX_STORES || "50",
            ENABLE_TRENDING_WATCHER: qWatchers.ENABLE_TRENDING_WATCHER ? "true" : "false",
            TRENDING_INTERVAL_MS: baseCfg.TRENDING_INTERVAL_MS || "60000",
            TRENDING_WINDOW_HOURS: baseCfg.TRENDING_WINDOW_HOURS || "24",
            TRENDING_PAGE_TOP: baseCfg.TRENDING_PAGE_TOP || "200",
            TRENDING_PAGES: baseCfg.TRENDING_PAGES || "3",
            TRENDING_TOP_N: baseCfg.TRENDING_TOP_N || "20",
            ENABLE_FEATURED_CONTENT_WATCHER: qWatchers.ENABLE_FEATURED_CONTENT_WATCHER ? "true" : "false",
            FEATURED_CONTENT_WATCH_INTERVAL_MS: baseCfg.FEATURED_CONTENT_WATCH_INTERVAL_MS || "21600000",
            ADV_SEARCH_TTL_MS: baseCfg.ADV_SEARCH_TTL_MS || "60000",
            ADV_SEARCH_BATCH: baseCfg.ADV_SEARCH_BATCH || "300",
            ADV_SEARCH_MAX_BATCHES: baseCfg.ADV_SEARCH_MAX_BATCHES || "10",
            MAX_SEARCH_BATCHES: baseCfg.MAX_SEARCH_BATCHES || "10",
            MAX_FETCH_BATCHES: baseCfg.MAX_FETCH_BATCHES || "20",
            PLAYFAB_CONCURRENCY: baseCfg.PLAYFAB_CONCURRENCY || "12",
            PLAYFAB_BATCH: baseCfg.PLAYFAB_BATCH || "600"
        };

        summaryIdentity(out);
        return out;
    })();
}

async function run() {
    const rootDir = path.join(__dirname, "..", "..");
    const envPath = path.join(rootDir, ".env");
    const gitignorePath = path.join(rootDir, ".gitignore");

    console.clear();
    frameBox(BRAND_NAME + " Setup", ["Welcome", "This wizard will configure your instance.", "", "You will define:", "  • Admin security", "  • Runtime / Network", "  • Validation / Docs", "  • Background Watchers"]);
    console.log("");
    console.log(BRAND_DIM("Press enter to continue..."));
    await prompts({
        type: "text", name: "_", message: ""
    });

    const currentEnv = loadEnvFile(envPath);
    const cfg = await askConfig(currentEnv);

    ensureDirForFile(envPath);
    writeEnvFile(envPath, cfg);
    ensureDataFiles(rootDir, cfg);
    ensureGitignoreEntries(gitignorePath, [".env"]);

    console.clear();
    frameBox(BRAND_NAME + " Setup", ["Done", "Your instance is ready."]);
    console.log("");

    console.log(BRAND_OK("✔ ") + BRAND_TEXT(".env has been updated in the project root.\n"));

    console.log(BRAND_TEXT("Admin login credentials:"));
    console.log(BRAND_TEXT("  Username: ") + BRAND_ACCENT(cfg.ADMIN_USER || "admin"));
    console.log(BRAND_TEXT("  Password: ") + BRAND_ACCENT(cfg.ADMIN_PASS || "<not set>"));
    console.log("");

    console.log(BRAND_DIM("Start the API:"));
    console.log(BRAND_ACCENT("  npm start"));
    console.log("");

    console.log(BRAND_WARN("Keep your admin password and JWT secret safe."));
    console.log("");
}

run().catch(err => {
    console.error(BRAND_ERROR("Setup failed:"), (err && err.stack) ? err.stack : err);
    process.exit(1);
});
