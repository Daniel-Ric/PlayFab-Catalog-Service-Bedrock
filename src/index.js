require("dotenv").config();
const express = require("express");
const compression = require("compression");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const winston = require("winston");
const logger = require("./config/logger");
const requestLogger = require("./middleware/requestLogger");
const titlesRoutes = require("./routes/titles");
const creatorsRoutes = require("./routes/creators");
const sessionRoutes = require("./routes/session");
const mpAll = require("./routes/marketplace/all");
const mpLatest = require("./routes/marketplace/latest");
const mpSearch = require("./routes/marketplace/search");
const mpPopular = require("./routes/marketplace/popular");
const mpTag = require("./routes/marketplace/tag");
const mpFree = require("./routes/marketplace/free");
const mpDetails = require("./routes/marketplace/details");
const mpFriendly = require("./routes/marketplace/friendly");
const mpResolve = require("./routes/marketplace/resolve");
const mpSummary = require("./routes/marketplace/summary");
const mpCompare = require("./routes/marketplace/compare");
const mpFeaturedServers = require("./routes/marketplace/featured-servers");
const mpSales = require("./routes/marketplace/sales");
const mpSearchAdvanced = require("./routes/marketplace/search-advanced");
const mpRecommendations = require("./routes/marketplace/recommendations");
const mpStats = require("./routes/marketplace/stats");
const eventsSales = require("./routes/events/sales");
const eventsItems = require("./routes/events/items");
const eventsPrices = require("./routes/events/prices");
const eventsTrending = require("./routes/events/trending");
const adminWebhooks = require("./routes/admin/webhooks");
const healthRoutes = require("./routes/health");
const chalkImport = require("chalk");
const chalk = chalkImport.default || chalkImport;
const swaggerUi = require("swagger-ui-express");
const {getOpenApiSpec} = require("./config/swagger");
const OpenApiValidator = require("express-openapi-validator");
const NodeCache = require("node-cache");
const {salesWatcher} = require("./services/salesWatcher");
const {itemWatcher} = require("./services/itemWatcher");
const {priceWatcher} = require("./services/priceWatcher");
const {trendingWatcher} = require("./services/trendingWatcher");

const art = `
 /$$    /$$ /$$      /$$  /$$$$$$     /$$   /$$ /$$$$$$$$ /$$$$$$$$
| $$   | $$| $$$    /$$$ /$$__  $$   | $$$ | $$| $$_____/|__  $$__/
| $$   | $$| $$$$  /$$$$| $$  \\__/   | $$$$| $$| $$         | $$   
|  $$ / $$/| $$ $$/$$ $$| $$         | $$ $$ $$| $$$$$      | $$   
 \\  $$ $$/ | $$  $$$| $$| $$         | $$  $$$$| $$__/      | $$   
  \\  $$$/  | $$\\  $ | $$| $$    $$   | $$\\  $$$| $$         | $$   
   \\  $/   | $$ \\/  | $$|  $$$$$$//$$| $$ \\  $$| $$$$$$$$   | $$   
    \\_/    |__/     |__/ \\______/|__/|__/  \\__/|________/   |__/   
`;

const app = express();

(function configureTrustProxy() {
    const val = process.env.TRUST_PROXY;
    if (typeof val === "undefined") app.set("trust proxy", 1); else if (/^\d+$/.test(val)) app.set("trust proxy", parseInt(val, 10)); else if (val === "true" || val === "false") app.set("trust proxy", val === "true"); else app.set("trust proxy", val.split(",").map(s => s.trim()).filter(Boolean));
})();

const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error("");
    console.error(chalk.bgRed.white.bold(" SETUP REQUIRED "));
    console.error(chalk.red("JWT_SECRET is missing or too short."));
    console.error(chalk.red("Run `npm run setup` to generate a valid .env and initial data files."));
    console.error("");
    process.exit(1);
}

app.use(helmet({contentSecurityPolicy: false, crossOriginResourcePolicy: {policy: "cross-origin"}}));

const allowed = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: allowed.length ? allowed : false,
    credentials: false,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "If-None-Match"]
}));

app.use((req, _res, next) => {
    req.id = req.headers["x-request-id"] || Math.random().toString(36).slice(2, 10);
    next();
});

if ((process.env.LOG_LEVEL || "info").toLowerCase() === "debug" || (logger.level || "") === "debug" || winston.level === "debug") {
    app.use(requestLogger);
}

const openapi = getOpenApiSpec();
app.get("/openapi.json", (_, res) => res.json(openapi));
if (process.env.ENABLE_DOCS === "true") {
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi, {explorer: true})).get("/docs", (_req, res) => res.end());
}

app.get("/", (_req, res) => res.json({ok: true, name: "View Marketplace API"}));

const loginLimiter = require("./config/rateLimiter").createRateLimiter({windowMs: 15 * 60 * 1000, max: 20});
app.post(["/login", "/login/"], loginLimiter, express.json({limit: "100kb"}), (req, res) => {
    const {username, password} = req.body || {};
    const isAdmin = username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS;
    if (!isAdmin) return res.status(401).json({error: "Invalid username or password"});
    const token = jwt.sign({sub: username, role: "admin"}, JWT_SECRET, {expiresIn: "1h"});
    res.json({token});
});

const jwtCache = new NodeCache({stdTTL: 0, checkperiod: 120, useClones: false});
const isDocs = p => p === "/docs" || p.startsWith("/docs/");
const pathIs = (reqPath, probe) => reqPath === probe || reqPath === `${probe}/`;

function enforceAuth(req, res, next) {
    if (req.method === "OPTIONS") return next();
    if (req.path === "/openapi.json" && req.method === "GET") return next();
    if (isDocs(req.path)) return next();
    if ((pathIs(req.path, "/login")) && req.method === "POST") return next();
    const header = req.headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            error: {type: "unauthorized", message: "Unauthorized", traceId: req.headers["x-request-id"] || req.id}
        });
    }
    const token = header.slice(7);
    const cached = jwtCache.get(token);
    if (cached) {
        req.user = cached;
        return next();
    }
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        const nowSec = Math.floor(Date.now() / 1000);
        const ttl = typeof payload.exp === "number" ? Math.max(1, payload.exp - nowSec) : 300;
        jwtCache.set(token, payload, ttl);
        return next();
    } catch {
        return res.status(403).json({
            error: {type: "forbidden", message: "Invalid token", traceId: req.headers["x-request-id"] || req.id}
        });
    }
}

app.use(compression({threshold: 1024, level: 4}));
app.use(express.json({limit: "200kb"}));

function requireRole(role) {
    return (req, _res, next) => {
        if (!req.user) {
            const err = new Error("Unauthorized");
            err.status = 401;
            throw err;
        }
        if (req.user.role !== role) {
            const err = new Error("Forbidden");
            err.status = 403;
            throw err;
        }
        next();
    };
}

if (process.env.VALIDATE_REQUESTS === "true") {
    function bearerAuthHandler(req) {
        const authHeader = req.headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            const err = new Error("Unauthorized");
            err.status = 401;
            throw err;
        }
        const token = authHeader.slice(7);
        const cached = jwtCache.get(token);
        if (cached) {
            req.user = cached;
            return true;
        }
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            req.user = payload;
            const nowSec = Math.floor(Date.now() / 1000);
            const ttl = typeof payload.exp === "number" ? Math.max(1, payload.exp - nowSec) : 300;
            jwtCache.set(token, payload, ttl);
            return true;
        } catch {
            const err = new Error("Invalid token");
            err.status = 403;
            throw err;
        }
    }

    app.use(OpenApiValidator.middleware({
        apiSpec: openapi,
        validateRequests: true,
        validateResponses: process.env.VALIDATE_RESPONSES === "true",
        validateSecurity: {handlers: {BearerAuth: bearerAuthHandler}}
    }));
}

function cacheHeaders(seconds = 60, smax = 300) {
    return (_req, res, next) => {
        res.setHeader("Cache-Control", `public, max-age=${seconds}, s-maxage=${smax}, stale-while-revalidate=600`);
        next();
    };
}

app.use("/session", enforceAuth, requireRole("admin"), sessionRoutes);

app.use("/titles", enforceAuth, titlesRoutes);
app.use("/creators", enforceAuth, creatorsRoutes);

app.use("/marketplace/all", enforceAuth, cacheHeaders(60, 300), mpAll);
app.use("/marketplace/latest", enforceAuth, cacheHeaders(30, 180), mpLatest);
app.use("/marketplace/search", enforceAuth, cacheHeaders(30, 180), mpSearch);
app.use("/marketplace/popular", enforceAuth, cacheHeaders(45, 240), mpPopular);
app.use("/marketplace/tag", enforceAuth, cacheHeaders(60, 300), mpTag);
app.use("/marketplace/free", enforceAuth, cacheHeaders(60, 300), mpFree);
app.use("/marketplace/details", enforceAuth, cacheHeaders(120, 600), mpDetails);
app.use("/marketplace/friendly", enforceAuth, cacheHeaders(120, 600), mpFriendly);
app.use("/marketplace/summary", enforceAuth, cacheHeaders(120, 600), mpSummary);
app.use("/marketplace/resolve", enforceAuth, cacheHeaders(60, 300), mpResolve);
app.use("/marketplace/compare", enforceAuth, cacheHeaders(60, 300), mpCompare);
app.use("/marketplace/featured-servers", enforceAuth, cacheHeaders(300, 1200), mpFeaturedServers);
app.use("/marketplace/sales", enforceAuth, cacheHeaders(60, 300), mpSales);
app.use("/marketplace/search/advanced", enforceAuth, mpSearchAdvanced);
app.use("/marketplace/recommendations", enforceAuth, cacheHeaders(60, 300), mpRecommendations);
app.use("/marketplace", enforceAuth, cacheHeaders(60, 300), mpStats);

app.use("/events/sales", enforceAuth, eventsSales);
app.use("/events/items", enforceAuth, eventsItems);
app.use("/events/prices", enforceAuth, eventsPrices);
app.use("/events/trending", enforceAuth, eventsTrending);

app.use("/admin/webhooks", enforceAuth, requireRole("admin"), adminWebhooks);

app.use("/health", enforceAuth, cacheHeaders(5, 5), healthRoutes);

app.use((req, res) => {
    res.status(404).json({error: "Route not found."});
});

app.use((err, req, res, _next) => {
    const status = err.status || 500;
    const traceId = req.headers["x-request-id"] || req.id;
    if (status >= 500) logger.error(err.stack || err.message);
    const payload = {
        error: {
            type: status === 400 ? "bad_request" : status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not_found" : "internal_error",
            message: status >= 500 && process.env.NODE_ENV === "production" ? "Internal server error." : err.publicMessage || err.message || "Error",
            details: Array.isArray(err.errors) ? err.errors : undefined,
            traceId
        }
    };
    res.status(status).json(payload);
});

app.listen(port, () => {
    console.log(chalk.cyan(art));
    logger.info(`API running at http://localhost:${port}`);
    if (process.env.ENABLE_SALES_WATCHER === "true") {
        const {eventBus} = require("./services/eventBus");
        const {webhookService} = require("./services/webhookService");
        salesWatcher.start(eventBus);
        logger.info("Sales watcher started");
        void webhookService;
    }
    if (process.env.ENABLE_ITEM_WATCHER === "true") {
        const {eventBus} = require("./services/eventBus");
        const {webhookService} = require("./services/webhookService");
        itemWatcher.start(eventBus);
        logger.info("Item watcher started");
        void webhookService;
    }
    if (process.env.ENABLE_PRICE_WATCHER === "true") {
        const {eventBus} = require("./services/eventBus");
        const {webhookService} = require("./services/webhookService");
        priceWatcher.start(eventBus);
        logger.info("Price watcher started");
        void webhookService;
    }
    if (process.env.ENABLE_TRENDING_WATCHER === "true") {
        const {eventBus} = require("./services/eventBus");
        const {webhookService} = require("./services/webhookService");
        trendingWatcher.start(eventBus);
        logger.info("Trending watcher started");
        void webhookService;
    }
});
