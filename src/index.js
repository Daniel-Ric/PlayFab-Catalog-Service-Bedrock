require("dotenv").config();
const express = require("express");
const compression = require("compression");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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
const chalkImport = require("chalk");
const chalk = chalkImport.default || chalkImport;
const auth = require("./middleware/auth");
const swaggerUi = require("swagger-ui-express");
const { getOpenApiSpec } = require("./config/swagger");
const OpenApiValidator = require("express-openapi-validator");
const NodeCache = require("node-cache");

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
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error("JWT_SECRET must be set and >=32 chars");
    process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

const allowed = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: allowed.length ? allowed : false, credentials: false, methods: ["GET", "POST", "DELETE", "OPTIONS"], allowedHeaders: ["Authorization", "Content-Type", "If-None-Match"] }));

app.use((req, _res, next) => {
    req.id = req.headers["x-request-id"] || Math.random().toString(36).slice(2, 10);
    next();
});

const globalLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 2000, standardHeaders: true, legacyHeaders: false, message: "Too many requests – please try again later." });
app.use(globalLimiter);

if ((process.env.LOG_LEVEL || "info").toLowerCase() === "debug" || (logger.level || "") === "debug" || winston.level === "debug") {
    app.use(requestLogger);
}

const openapi = getOpenApiSpec();
app.get("/openapi.json", (_, res) => res.json(openapi));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.post("/login", loginLimiter, express.json({ limit: "100kb" }), (req, res) => {
    const { username, password } = req.body || {};
    const isAdmin = username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS;
    if (isAdmin) {
        const token = jwt.sign({ sub: username, role: "admin" }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ token });
    } else {
        res.status(401).json({ error: "Invalid username or password" });
    }
});

app.use(auth);

const jwtCache = new NodeCache({ stdTTL: 0, checkperiod: 120, useClones: false });
const isDocs = p => p === "/docs" || p.startsWith("/docs/");
const enforceAuth = (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    if (req.path === "/openapi.json" && req.method === "GET") return next();
    if (isDocs(req.path)) return next();
    if (req.path === "/login" && req.method === "POST") return next();
    const header = req.headers["authorization"];
    if (!header || header.charCodeAt(0) !== 66 || !header.startsWith("Bearer ")) {
        return res.status(401).json({ error: { type: "unauthorized", message: "Unauthorized", traceId: req.headers["x-request-id"] || req.id } });
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
        return res.status(403).json({ error: { type: "forbidden", message: "Invalid token", traceId: req.headers["x-request-id"] || req.id } });
    }
};
app.use(enforceAuth);

app.use(compression());
app.use(express.json({ limit: "200kb" }));

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
    app.use(OpenApiValidator.middleware({ apiSpec: openapi, validateRequests: true, validateResponses: process.env.VALIDATE_RESPONSES === "true", validateSecurity: { handlers: { BearerAuth: bearerAuthHandler } } }));
}

function cacheHeaders(seconds = 60) {
    return (_req, res, next) => {
        res.setHeader("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=300`);
        next();
    };
}

app.use("/titles", titlesRoutes);
app.use("/creators", creatorsRoutes);
app.use("/session", requireRole("admin"), sessionRoutes);

app.use("/marketplace/all", cacheHeaders(60), mpAll);
app.use("/marketplace/latest", cacheHeaders(30), mpLatest);
app.use("/marketplace/search", cacheHeaders(30), mpSearch);
app.use("/marketplace/popular", cacheHeaders(45), mpPopular);
app.use("/marketplace/tag", cacheHeaders(60), mpTag);
app.use("/marketplace/free", cacheHeaders(60), mpFree);
app.use("/marketplace/details", cacheHeaders(120), mpDetails);
app.use("/marketplace/friendly", cacheHeaders(120), mpFriendly);
app.use("/marketplace/summary", cacheHeaders(120), mpSummary);
app.use("/marketplace/resolve", cacheHeaders(60), mpResolve);
app.use("/marketplace/compare", cacheHeaders(60), mpCompare);
app.use("/marketplace/featured-servers", cacheHeaders(300), mpFeaturedServers);
app.use("/marketplace/sales", cacheHeaders(60), mpSales);

app.use((req, res) => {
    res.status(404).json({ error: "Route not found." });
});

app.use((err, req, res, next) => {
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
    logger.info(`✨ API running at http://localhost:${port} ✨`);
});
