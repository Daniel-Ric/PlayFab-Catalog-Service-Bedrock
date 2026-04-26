// -----------------------------------------------------------------------------
//
// File: .github/scripts/generate-wiki.js
// Generates structured GitHub Wiki markdown from the repository's OpenAPI spec,
// source tree, package metadata, tests, and runtime configuration references.
//
// -----------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.join(repoRoot, "build", "wiki");
const {getOpenApiSpec} = require(path.join(repoRoot, "src", "config", "swagger"));

const repoUrl = "https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock";
const wikiUrl = `${repoUrl}/wiki`;
const packageJson = readJson("package.json");
const openapi = getOpenApiSpec();

function readText(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
    return JSON.parse(readText(relativePath));
}

function ensureCleanDir(dir) {
    fs.mkdirSync(dir, {recursive: true});
}

function writePage(name, body) {
    fs.writeFileSync(path.join(outputDir, `${name}.md`), `${body.trim()}\n`, "utf8");
}

function walkFiles(dir, predicate = () => true, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "build") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkFiles(full, predicate, acc);
        } else if (predicate(full)) {
            acc.push(full);
        }
    }
    return acc.sort();
}

function relative(file) {
    return path.relative(repoRoot, file).replace(/\\/g, "/");
}

function code(value) {
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function linkPage(title, page) {
    return `[${title}](${wikiUrl}/${encodeURIComponent(page).replace(/%20/g, "-")})`;
}

function headingAnchor(text) {
    return String(text)
        .toLowerCase()
        .replace(/`/g, "")
        .replace(/[^a-z0-9 -]/g, "")
        .trim()
        .replace(/\s+/g, "-");
}

function table(headers, rows) {
    if (!rows.length) return "";
    const escapeCell = (value) => String(value ?? "")
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, "<br>");
    return [
        `| ${headers.map(escapeCell).join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
    ].join("\n");
}

function section(title, body) {
    return `## ${title}\n\n${body.trim()}`;
}

function operationRows() {
    const rows = [];
    for (const [route, methods] of Object.entries(openapi.paths || {}).sort(([a], [b]) => a.localeCompare(b))) {
        for (const [method, operation] of Object.entries(methods).sort(([a], [b]) => a.localeCompare(b))) {
            if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
            rows.push([
                method.toUpperCase(),
                code(route),
                (operation.tags || []).join(", ") || "-",
                operation.summary || operation.description || "-",
                operation.security === undefined ? "BearerAuth" : Array.isArray(operation.security) && operation.security.length === 0 ? "Public" : "BearerAuth",
            ]);
        }
    }
    return rows;
}

function formatSchemaRef(schema) {
    if (!schema) return "-";
    if (schema.$ref) return code(schema.$ref.replace("#/components/schemas/", ""));
    if (schema.type) return code(schema.type);
    if (schema.oneOf) return schema.oneOf.map(formatSchemaRef).join(" or ");
    if (schema.anyOf) return schema.anyOf.map(formatSchemaRef).join(" or ");
    return code("object");
}

function responseSummary(responses = {}) {
    return Object.entries(responses)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([status, response]) => {
            const content = response.content || {};
            const media = content["application/json"] || content["text/event-stream"] || Object.values(content)[0];
            const schema = media && media.schema ? ` ${formatSchemaRef(media.schema)}` : "";
            return `${code(status)} ${response.description || ""}${schema}`.trim();
        })
        .join("<br>");
}

function parametersSummary(operation) {
    const params = operation.parameters || [];
    if (!params.length) return "-";
    return params
        .map((p) => `${code(p.name)} (${p.in}${p.required ? ", required" : ""})`)
        .join("<br>");
}

function requestBodySummary(operation) {
    const body = operation.requestBody;
    if (!body) return "-";
    const content = body.content || {};
    const json = content["application/json"] || Object.values(content)[0];
    return json && json.schema ? formatSchemaRef(json.schema) : "Body accepted";
}

function detailedApiSections() {
    const groups = new Map();
    for (const [route, methods] of Object.entries(openapi.paths || {}).sort(([a], [b]) => a.localeCompare(b))) {
        for (const [method, operation] of Object.entries(methods).sort(([a], [b]) => a.localeCompare(b))) {
            if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
            const tag = (operation.tags || ["Other"])[0];
            if (!groups.has(tag)) groups.set(tag, []);
            groups.get(tag).push({route, method, operation});
        }
    }

    return [...groups.entries()].map(([tag, operations]) => {
        const blocks = operations.map(({route, method, operation}) => {
            const title = `${method.toUpperCase()} ${route}`;
            return [
                `### ${title}`,
                "",
                operation.summary || operation.description || "No summary provided.",
                "",
                table(["Property", "Value"], [
                    ["Authentication", operation.security === undefined ? "Bearer JWT unless explicitly public" : Array.isArray(operation.security) && operation.security.length === 0 ? "Public" : "Bearer JWT"],
                    ["Parameters", parametersSummary(operation)],
                    ["Request body", requestBodySummary(operation)],
                    ["Responses", responseSummary(operation.responses)],
                ]),
            ].join("\n");
        }).join("\n\n");
        return section(tag, blocks);
    }).join("\n\n");
}

function schemaRows() {
    return Object.entries(openapi.components?.schemas || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, schema]) => [
            code(name),
            schema.type || (schema.oneOf ? "oneOf" : "object"),
            Array.isArray(schema.required) && schema.required.length ? schema.required.map(code).join(", ") : "-",
            Object.keys(schema.properties || {}).map(code).join(", ") || "-",
        ]);
}

function extractEnvVariables() {
    const files = walkFiles(path.join(repoRoot, "src"), (file) => file.endsWith(".js"));
    const vars = new Map();
    const direct = /process\.env\.([A-Z0-9_]+)/g;
    const dynamic = /process\.env\[\s*`([^`]+)`\s*\]/g;
    const bracket = /process\.env\[\s*["']([A-Z0-9_]+)["']\s*\]/g;

    for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        for (const regex of [direct, dynamic, bracket]) {
            let match;
            while ((match = regex.exec(text))) {
                const raw = match[1];
                const names = raw.includes("${")
                    ? [raw.replace(/\$\{[^}]+\}/g, "*")]
                    : [raw];
                for (const name of names) {
                    if (!vars.has(name)) vars.set(name, new Set());
                    vars.get(name).add(relative(file));
                }
            }
        }
    }

    return [...vars.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, filesSet]) => [code(name), [...filesSet].sort().map(code).join("<br>")]);
}

function moduleInventory() {
    const groups = [
        ["Routes", "src/routes"],
        ["Controllers", "src/controllers"],
        ["Services", "src/services"],
        ["Middleware", "src/middleware"],
        ["Utilities", "src/utils"],
        ["Configuration", "src/config"],
        ["OpenAPI Paths", "src/docs/paths"],
        ["OpenAPI Schemas", "src/docs/schemas"],
        ["Tests", "test"],
    ];
    return groups.map(([name, dir]) => {
        const files = walkFiles(path.join(repoRoot, dir), () => true).map((file) => `- ${code(relative(file))}`).join("\n") || "- None";
        return `### ${name}\n\n${files}`;
    }).join("\n\n");
}

function scriptRows() {
    return Object.entries(packageJson.scripts || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, command]) => [code(`npm run ${name}`), code(command)]);
}

function dependencyRows(deps) {
    return Object.entries(deps || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, version]) => [code(name), code(version)]);
}

function operations() {
    const list = [];
    for (const [route, methods] of Object.entries(openapi.paths || {}).sort(([a], [b]) => a.localeCompare(b))) {
        for (const [method, operation] of Object.entries(methods).sort(([a], [b]) => a.localeCompare(b))) {
            if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
            list.push({route, method, operation, tag: (operation.tags || ["Other"])[0]});
        }
    }
    return list;
}

function authLabel(operation) {
    return operation.security === undefined
        ? "Bearer JWT"
        : Array.isArray(operation.security) && operation.security.length === 0
            ? "Public"
            : "Bearer JWT";
}

function tagOverviewRows() {
    const groups = new Map();
    for (const item of operations()) {
        if (!groups.has(item.tag)) groups.set(item.tag, []);
        groups.get(item.tag).push(item);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tag, items]) => {
        const publicCount = items.filter((item) => authLabel(item.operation) === "Public").length;
        const methods = [...new Set(items.map((item) => item.method.toUpperCase()))].sort().map(code).join(", ");
        return [tag, String(items.length), methods, publicCount ? `${publicCount} public` : "Protected"];
    });
}

function authMatrixRows() {
    return operations().map(({route, method, operation, tag}) => [
        method.toUpperCase(),
        code(route),
        tag,
        authLabel(operation),
        operation.summary || operation.description || "-",
    ]);
}

function envCategory(name) {
    if (/^(JWT|ADMIN|CORS|TRUST_PROXY|NODE_ENV|LOG_LEVEL|PORT|ENABLE_DOCS|VALIDATE_)/.test(name)) return "Runtime and security";
    if (/^(RATE_LIMIT)/.test(name)) return "Rate limiting";
    if (/^(SESSION_|DATA_|.*TTL|.*CACHE|PAGE_SIZE|DETAILS_|SUMMARY_|RECOMMENDATIONS_|CREATOR_STATS_)/.test(name)) return "Caching and pagination";
    if (/^(ENABLE_|.*WATCH|TRENDING_|PRICE_|SALES_|ITEM_|FEATURED_)/.test(name)) return "Watchers and events";
    if (/^(WEBHOOK_)/.test(name)) return "Webhooks";
    if (/^(PLAYFAB_|TITLE_ID|DEFAULT_ALIAS|OS|MAX_|FETCH_|STORE_|MULTILANG_|ADV_SEARCH_|FX_)/.test(name)) return "PlayFab and marketplace";
    if (/^(MC_)/.test(name)) return "Minecraft service integration";
    return "Other";
}

function envCategoryRows() {
    const variables = extractEnvVariables().map(([name, files]) => ({
        name: name.replace(/`/g, ""),
        files,
    }));
    const groups = new Map();
    for (const variable of variables) {
        const category = envCategory(variable.name);
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(variable);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, vars]) => [
        category,
        String(vars.length),
        vars.map((v) => code(v.name)).join(", "),
    ]);
}

function testRows() {
    return walkFiles(path.join(repoRoot, "test"), (file) => file.endsWith(".js"))
        .map((file) => {
            const text = fs.readFileSync(file, "utf8");
            const cases = (text.match(/\btest\s*\(/g) || []).length;
            return [code(relative(file)), String(cases), summarizeTestArea(relative(file))];
        });
}

function summarizeTestArea(file) {
    if (file.includes("webhook")) return "Webhook URL safety and target validation";
    if (file.includes("title")) return "Title alias resolution and title data behavior";
    if (file.includes("marketplaceTokens")) return "Marketplace entity token input handling";
    if (file.includes("marketplaceFilters")) return "Advanced marketplace filter building";
    if (file.includes("itemWatcher")) return "Item watcher change classification";
    if (file.includes("featuredContentWatcher")) return "Featured content watcher payload generation";
    if (file.includes("eventPayload")) return "Event payload shaping";
    return "Project behavior";
}

function inventorySummaryRows() {
    const dirs = [
        ["Routes", "src/routes"],
        ["Controllers", "src/controllers"],
        ["Services", "src/services"],
        ["Middleware", "src/middleware"],
        ["Utilities", "src/utils"],
        ["OpenAPI path files", "src/docs/paths"],
        ["OpenAPI schema files", "src/docs/schemas"],
        ["Tests", "test"],
    ];
    return dirs.map(([label, dir]) => [
        label,
        code(dir),
        String(walkFiles(path.join(repoRoot, dir), () => true).length),
    ]);
}

function generatedNotice() {
    return [
        "> [!NOTE]",
        "> This documentation is rebuilt from the repository's source of truth: OpenAPI files, runtime code, package metadata, tests, and the wiki generator.",
        "> To make durable documentation changes, update the source files or `.github/scripts/generate-wiki.js`; direct wiki edits are replaced during the next sync.",
    ].join("\n");
}

ensureCleanDir(outputDir);

writePage("Home", `
# PlayFab Catalog Service Bedrock Wiki

${generatedNotice()}

This wiki documents the PlayFab Catalog Service Bedrock repository from the current source tree, OpenAPI specification, package metadata, tests, and runtime configuration references.

## Project Snapshot

${table(["Field", "Value"], [
    ["Package", code(packageJson.name)],
    ["Version", code(packageJson.version)],
    ["Runtime", "Node.js / CommonJS"],
    ["Framework", "Express"],
    ["OpenAPI", `${openapi.info?.title || "API"} ${openapi.info?.version ? code(openapi.info.version) : ""}`],
    ["Repository", repoUrl],
])}

## Main Areas

- ${linkPage("Getting Started", "Getting-Started")} explains installation, local startup, authentication, and first requests.
- ${linkPage("Configuration", "Configuration")} lists runtime environment variables discovered in source code.
- ${linkPage("Architecture", "Architecture")} describes the application layers, request lifecycle, caching, watchers, and external integrations.
- ${linkPage("API Reference", "API-Reference")} is built from the OpenAPI path files.
- ${linkPage("Schemas", "Schemas")} summarizes OpenAPI component schemas.
- ${linkPage("Security and Authentication", "Security-and-Authentication")} documents bearer tokens, admin-only routes, CORS, validation, and webhook safety.
- ${linkPage("Runtime Data Flow", "Runtime-Data-Flow")} explains how requests, upstream calls, caches, events, SSE, and webhooks interact.
- ${linkPage("Events and Webhooks", "Events-and-Webhooks")} covers SSE, internal event flow, webhook registration, and delivery behavior.
- ${linkPage("Operations", "Operations")} covers deployment, security, rate limits, observability, and maintenance.
- ${linkPage("Development", "Development")} covers scripts, tests, and contribution workflow.
- ${linkPage("Repository Inventory", "Repository-Inventory")} lists the generated module inventory.

## Repository Composition

${table(["Area", "Directory", "Files"], inventorySummaryRows())}

## API Groups

${table(["Tag", "Operations", "Methods", "Exposure"], tagOverviewRows())}

## Endpoint Overview

${table(["Method", "Path", "Tags", "Summary", "Auth"], operationRows())}
`);

writePage("_Sidebar", `
- [Home](Home)
- [Getting Started](Getting-Started)
- [Configuration](Configuration)
- [Architecture](Architecture)
- [API Reference](API-Reference)
- [Schemas](Schemas)
- [Security and Authentication](Security-and-Authentication)
- [Runtime Data Flow](Runtime-Data-Flow)
- [Events and Webhooks](Events-and-Webhooks)
- [Operations](Operations)
- [Development](Development)
- [Repository Inventory](Repository-Inventory)
`);

writePage("Getting-Started", `
# Getting Started

${generatedNotice()}

## Requirements

- Node.js 22 is used by the repository automation.
- npm is used for dependency installation and scripts.
- A valid ${code("JWT_SECRET")} with at least 32 characters is required before the server starts.
- ${code("ADMIN_USER")} and ${code("ADMIN_PASS")} are required for ${code("POST /login")}.

## Install

\`\`\`bash
git clone ${repoUrl}.git
cd PlayFab-Catalog-Service-Bedrock
npm ci
\`\`\`

## Configure

Run the interactive setup when creating a local environment:

\`\`\`bash
npm run setup
\`\`\`

The setup script writes the local environment file and initial data files. Do not commit secrets.

## Start

\`\`\`bash
npm start
\`\`\`

For development with automatic restart:

\`\`\`bash
npm run dev
\`\`\`

## Authenticate

Most endpoints require a bearer JWT. Request a token:

\`\`\`bash
curl -X POST http://localhost:3000/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"<admin-user>","password":"<admin-password>"}'
\`\`\`

Use the returned token:

\`\`\`bash
curl http://localhost:3000/health \\
  -H "Authorization: Bearer <token>"
\`\`\`

## Local Documentation

The raw OpenAPI document is always available at ${code("/openapi.json")}. Swagger UI is served at ${code("/docs")} when ${code("ENABLE_DOCS=true")}.
`);

writePage("Configuration", `
# Configuration

${generatedNotice()}

Configuration is driven by environment variables. The table below is discovered from ${code("src/**/*.js")} references, so it stays aligned with the implementation.

## Discovered Variables

${table(["Variable", "Referenced From"], extractEnvVariables())}

## Configuration Categories

${table(["Category", "Variables", "Names"], envCategoryRows())}

## Required Runtime Values

- ${code("JWT_SECRET")} must be set and must be at least 32 characters long.
- ${code("ADMIN_USER")} and ${code("ADMIN_PASS")} control login credentials for admin JWT creation.
- ${code("TITLE_ID")}, ${code("DEFAULT_ALIAS")}, and ${code("FEATURED_PRIMARY_ALIAS")} control default PlayFab title resolution.

## Operational Toggles

- ${code("ENABLE_DOCS")} exposes Swagger UI.
- ${code("VALIDATE_REQUESTS")} enables OpenAPI request validation.
- ${code("VALIDATE_RESPONSES")} enables OpenAPI response validation.
- ${code("ENABLE_SALES_WATCHER")}, ${code("ENABLE_ITEM_WATCHER")}, ${code("ENABLE_PRICE_WATCHER")}, ${code("ENABLE_TRENDING_WATCHER")}, and ${code("ENABLE_FEATURED_CONTENT_WATCHER")} control background event producers.
- ${code("RATE_LIMIT_ENABLE")} or ${code("RATE_LIMIT_ENABLED")} enables configurable rate limiter overrides.

## Security Notes

Never commit local ${code(".env")} files, JWT secrets, admin passwords, webhook secrets, or deployment credentials. Treat generated wiki content as public documentation.
`);

writePage("Architecture", `
# Architecture

${generatedNotice()}

## Runtime Shape

The service is an Express application started from ${code("src/index.js")}. It configures security middleware, CORS, compression, JSON parsing, optional OpenAPI validation, JWT authentication, route-specific rate limiting, route mounting, and final error handling.

## Request Lifecycle

1. Helmet applies baseline HTTP security headers.
2. CORS checks the request origin against configured origins.
3. A request id is assigned from ${code("x-request-id")} or generated locally.
4. Optional debug request logging runs when log level is debug.
5. Compression is applied except for Server-Sent Events.
6. JSON body parsing runs with a bounded payload size.
7. JWT enforcement and role guards protect most routes.
8. Route-specific controllers call services and utilities.
9. Errors are normalized into the shared error response shape.

## Layers

- Routes in ${code("src/routes")} define HTTP surface area and delegate to controllers.
- Controllers in ${code("src/controllers")} parse input, call service functions, and build responses.
- Services in ${code("src/services")} contain marketplace aggregation, watchers, SSE hub, webhooks, and advanced search behavior.
- Utilities in ${code("src/utils")} contain PlayFab transport, filtering, projection, pagination, storage, hashing, CORS, and event payload helpers.
- OpenAPI files in ${code("src/docs")} define the machine-readable API contract.

## Caching

The project uses process-local caches for session data, general data, upstream PlayFab responses, item lookups, details, summaries, recommendations, stats, and advanced search results. HTTP responses also use cache headers on selected read endpoints.

## Background Watchers

When enabled, watchers start after the HTTP server begins listening. They publish events through the shared event bus, which can feed SSE clients and webhook delivery.

## External Systems

- PlayFab Catalog APIs are used for marketplace search, item lookup, stores, sessions, and enrichment.
- Minecraft service endpoints are used by featured servers, featured persona, and token-related flows.
- Webhook targets receive signed JSON payloads with retry and concurrency controls.
`);

writePage("API-Reference", `
# API Reference

${generatedNotice()}

This reference is built from ${code("src/docs/openapi-base.yaml")} and all files in ${code("src/docs/paths")}. The source of truth for request and response validation remains the OpenAPI specification.

## Summary

${table(["Method", "Path", "Tags", "Summary", "Auth"], operationRows())}

## Group Overview

${table(["Tag", "Operations", "Methods", "Exposure"], tagOverviewRows())}

## Authentication Matrix

${table(["Method", "Path", "Tag", "Authentication", "Purpose"], authMatrixRows())}

${detailedApiSections()}
`);

writePage("Schemas", `
# Schemas

${generatedNotice()}

OpenAPI component schemas are loaded from ${code("src/docs/schemas")} and merged into the runtime OpenAPI document.

## Schema Index

${table(["Schema", "Type", "Required Fields", "Properties"], schemaRows())}

## Contract Notes

- Schemas in ${code("src/docs/schemas")} are merged with base schemas from ${code("src/docs/openapi-base.yaml")}.
- Path documents in ${code("src/docs/paths")} reference these schemas through ${code("#/components/schemas/...")}.
- Runtime validation is optional and controlled with ${code("VALIDATE_REQUESTS")} and ${code("VALIDATE_RESPONSES")}.
- The implementation still performs additional runtime checks in controllers, middleware, and utilities where OpenAPI cannot express the full safety policy.
`);

writePage("Security-and-Authentication", `
# Security and Authentication

${generatedNotice()}

## Authentication Model

The API uses JWT bearer authentication for protected routes. ${code("POST /login")} validates ${code("ADMIN_USER")} and ${code("ADMIN_PASS")} and returns a short-lived token signed with ${code("JWT_SECRET")}. Protected requests must send ${code("Authorization: Bearer <token>")}.

## Route Exposure Matrix

${table(["Method", "Path", "Tag", "Authentication", "Purpose"], authMatrixRows())}

## Admin Boundaries

Admin-only behavior is enforced with role checks after JWT validation. Session, title management, creator management, and webhook management are operational surfaces and should be treated as privileged.

## Public Surfaces

The implementation intentionally allows unauthenticated access to ${code("/login")} and ${code("/openapi.json")}. Swagger UI at ${code("/docs")} is only mounted when ${code("ENABLE_DOCS=true")}. Public routes should be reviewed before exposing the service outside trusted networks.

## CORS and Proxy Trust

CORS is based on ${code("CORS_ORIGINS")}. Reverse proxy behavior is controlled through ${code("TRUST_PROXY")}. In production, configure both explicitly so request IPs, rate limits, and browser access rules reflect the deployed network topology.

## Webhook Target Safety

Webhook URL validation is covered by tests and utility code. The service rejects unsafe URL forms and private or local network targets to reduce SSRF risk. Webhook payload signing is available when a webhook secret is configured.
`);

writePage("Runtime-Data-Flow", `
# Runtime Data Flow

${generatedNotice()}

## HTTP Request Flow

1. Express receives the request and assigns a request id.
2. Security, CORS, compression, JSON parsing, and optional request logging run before route handling.
3. Authentication validates and caches JWT payloads where required.
4. Route modules dispatch to controllers.
5. Controllers normalize input and call services or utilities.
6. Services call PlayFab, Minecraft service endpoints, local JSON storage, caches, event bus, SSE hub, or webhook dispatcher as needed.
7. Responses are returned with cache headers on selected read-heavy endpoints.
8. Errors are normalized into the shared error envelope with a trace id.

## Upstream Data Flow

Marketplace endpoints usually resolve a title alias, obtain or reuse session data, call PlayFab Catalog endpoints, optionally enrich item data, project the upstream shape into API-facing output, and cache hot results.

## Cache Layers

- JWT payload cache reduces repeated token verification cost.
- Session cache stores PlayFab session data.
- Generic data cache stores frequently requested marketplace and upstream responses.
- Endpoint-level cache headers allow clients and proxies to reuse stable read responses.
- Specialized TTLs exist for details, summaries, recommendations, advanced search, stats, featured servers, and featured persona data.

## Event Flow

Watchers poll or resolve marketplace state, classify changes, publish events to the event bus, and then fan out to SSE subscribers and webhook deliveries. This keeps event generation separate from delivery mechanics.

## Failure Behavior

Controllers and services should throw normal errors with status information where possible. The global error handler maps known status codes to stable error types and hides internal details in production for server errors.
`);

writePage("Events-and-Webhooks", `
# Events and Webhooks

${generatedNotice()}

## Event Flow

Background services publish normalized events to the shared event bus. The SSE hub streams those events to connected clients, and the webhook dispatcher delivers matching events to registered webhook targets.

## Server-Sent Events

The SSE HTTP surface is documented in ${linkPage("API Reference", "API-Reference")} under the Events tag. SSE responses are not compressed and send heartbeats based on ${code("SSE_HEARTBEAT_MS")}.

## Watcher Sources

- Sales watcher emits sale-related changes.
- Item watcher emits item lifecycle and content changes.
- Price watcher emits price signature changes.
- Trending watcher emits trending creator data.
- Featured content watcher emits featured content updates.

## Webhook Management

Webhook routes are protected by admin authorization. Registered targets can define URL, active state, vendor, events, filters, and optional signing secret.

## Delivery Behavior

Webhook dispatch is controlled by ${code("WEBHOOK_CONCURRENCY")}, ${code("WEBHOOK_MAX_RETRIES")}, ${code("WEBHOOK_TIMEOUT_MS")}, ${code("WEBHOOK_QUEUE_MAX")}, ${code("WEBHOOK_RETRY_BASE_MS")}, and ${code("WEBHOOK_RETRY_MAX_MS")}. Payload signatures use the configured webhook secret when present.

## Event Consumer Guidance

- Treat SSE as a live notification channel, not as durable storage.
- Use webhook idempotency on the receiving side because retries can deliver the same logical event more than once.
- Persist the event payload and trace information before doing expensive downstream work.
- Keep webhook endpoints fast and return a success status only after the payload is accepted.
`);

writePage("Operations", `
# Operations

${generatedNotice()}

## Health

The health routes expose runtime, cache, watcher, docs, title, and configuration status. Use the generated ${linkPage("API Reference", "API-Reference")} for exact response schemas.

## Security Model

- JWT bearer authentication protects most endpoints.
- Admin-only routes require a token with ${code("role: admin")}.
- ${code("/login")}, ${code("/openapi.json")}, and optionally ${code("/docs")} are available without bearer enforcement.
- CORS is controlled by ${code("CORS_ORIGINS")}.
- OpenAPI request and response validation can be enabled for stricter runtime checks.

## Rate Limiting

The service has route-level limiters for login, marketplace, player marketplace, admin, and health traffic. Global and per-scope limit values can be overridden with ${code("RATE_LIMIT_*")} variables.

## Deployment Checklist

- Set ${code("NODE_ENV=production")}.
- Set a strong ${code("JWT_SECRET")}.
- Set admin credentials through deployment secrets.
- Review watcher toggles and intervals before enabling them in production.
- Review PlayFab and Minecraft upstream timeout, retry, batch, and concurrency settings.
- Configure reverse proxy trust with ${code("TRUST_PROXY")} when running behind a proxy.
- Keep ${code("ENABLE_DOCS=false")} unless Swagger UI should be publicly reachable.

## Wiki Automation

The ${code("Sync GitHub Wiki")} workflow runs on source, OpenAPI, package, and documentation changes on ${code("main")}. It generates pages with ${code("npm run wiki:generate")} and pushes them to ${code("Daniel-Ric/PlayFab-Catalog-Service-Bedrock.wiki")}.

Use ${code("[skip wiki]")} in a commit message to skip an automatic sync.

## Operational Runbook

- After changing route behavior, update the OpenAPI path file and run ${code("npm run wiki:generate")} locally.
- After adding environment variables, ensure they are read through ${code("process.env")} so the configuration page can discover them.
- After adding a new watcher or event type, document the event behavior in code and add or update tests.
- Before production rollout, run tests and review generated wiki changes for accidental secret exposure.
`);

writePage("Development", `
# Development

${generatedNotice()}

## npm Scripts

${table(["Command", "Runs"], scriptRows())}

## Tests

The test files under ${code("test")} cover marketplace token and filter utilities, event payloads, featured content watcher behavior, item watcher behavior, title handling, and webhook target logic.

${table(["Test File", "Cases", "Coverage Area"], testRows())}

\`\`\`bash
npm test
\`\`\`

## Generated Wiki

Generate the wiki locally:

\`\`\`bash
npm run wiki:generate
\`\`\`

Generated files are written to ${code("build/wiki")}. The GitHub Action publishes that directory into the repository wiki.

## Dependencies

${table(["Dependency", "Version"], dependencyRows(packageJson.dependencies))}
`);

writePage("Repository-Inventory", `
# Repository Inventory

${generatedNotice()}

${moduleInventory()}
`);

console.log(`Generated wiki pages in ${path.relative(repoRoot, outputDir).replace(/\\/g, "/")}`);
