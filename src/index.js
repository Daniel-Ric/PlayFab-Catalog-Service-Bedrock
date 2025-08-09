require("dotenv").config();

const express       = require("express");
const bodyParser    = require("body-parser");
const compression   = require("compression");
const cors          = require("cors");
const jwt           = require("jsonwebtoken");

const logger        = require("./config/logger");
const rateLimiter   = require("./config/rateLimiter");
const requestLogger = require("./middleware/requestLogger");

const titlesRoutes   = require("./routes/titles");
const creatorsRoutes = require("./routes/creators");
const sessionRoutes  = require("./routes/session");

const mpAll             = require("./routes/marketplace/all");
const mpLatest          = require("./routes/marketplace/latest");
const mpSearch          = require("./routes/marketplace/search");
const mpPopular         = require("./routes/marketplace/popular");
const mpTag             = require("./routes/marketplace/tag");
const mpFree            = require("./routes/marketplace/free");
const mpDetails         = require("./routes/marketplace/details");
const mpFriendly        = require("./routes/marketplace/friendly");
const mpSummary         = require("./routes/marketplace/summary");
const mpCompare         = require("./routes/marketplace/compare");
const mpFeaturedServers = require("./routes/marketplace/featured-servers");

const chalkImport = require("chalk");
const chalk       = chalkImport.default || chalkImport;

const art = `
 /$$    /$$ /$$      /$$  /$$$$$$     /$$   /$$ /$$$$$$$$ /$$$$$$$$
| $$   | $$| $$$    /$$$ /$$__  $$   | $$$ | $$| $$_____/|__  $$__/
| $$   | $$| $$$$  /$$$$| $$  \\__/   | $$$$| $$| $$         | $$   
|  $$ / $$/| $$ $$/$$ $$| $$         | $$ $$ $$| $$$$$      | $$   
 \\  $$ $$/ | $$  $$$| $$| $$         | $$  $$$$| $$__/      | $$   
  \\  $$$/  | $$\\  $ | $$| $$    $$   | $$\\  $$$| $$         | $$   
   \\  $/   | $$ \\/  | $$|  $$$$$$//$$| $$ \\  $$| $$$$$$$$   | $$   
    \\_/    |__/     |__/ \\______/|__/|__/  \\__/|________/   |__/   

                  View-MarketplaceNET powered by PlayFab-Service
                      Developed with <3 by SpindexGFX
`;

const app  = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(compression());
app.use(bodyParser.json());
app.use(cors());
app.use(rateLimiter);
app.use(requestLogger);

const swaggerUi = require("swagger-ui-express");
const { getOpenApiSpec } = require("./config/swagger");
const openapi = getOpenApiSpec();
app.get("/openapi.json", (_, res) => res.json(openapi));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi, { explorer: true }));

const OpenApiValidator = require("express-openapi-validator");

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ token });
    } else {
        res.status(401).json({ error: "Invalid username or password" });
    }
});

function bearerAuthHandler(req) {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const err = new Error("Unauthorized");
        err.status = 401;
        throw err;
    }
    const token = authHeader.split(" ")[1];
    try {
        req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
        const err = new Error("Invalid token");
        err.status = 403;
        throw err;
    }
    return true;
}

app.use(
    OpenApiValidator.middleware({
        apiSpec: openapi,
        validateRequests: true,
        validateResponses: false,
        validateSecurity: {
            handlers: {
                BearerAuth: bearerAuthHandler
            }
        }
    })
);

app.use("/titles",   titlesRoutes);
app.use("/creators", creatorsRoutes);
app.use("/session",  sessionRoutes);

app.use("/marketplace/all",         mpAll);
app.use("/marketplace/latest",      mpLatest);
app.use("/marketplace/search",      mpSearch);
app.use("/marketplace/popular",     mpPopular);
app.use("/marketplace/tag",         mpTag);
app.use("/marketplace/free",        mpFree);
app.use("/marketplace/details",     mpDetails);
app.use("/marketplace/friendly",    mpFriendly);
app.use("/marketplace/summary",     mpSummary);
app.use("/marketplace/compare",     mpCompare);
app.use("/marketplace/featured-servers", mpFeaturedServers);

// --- 404 für unbekannte Routen ---
app.use((req, res) => {
    res.status(404).json({ error: "Route not found." });
});

// --- Globaler Fehler-Handler ---
app.use((err, req, res, next) => {
    if (err.status === 401) {
        logger.warn(`401 ${req.method} ${req.originalUrl}`);
        return res.status(401).json({ error: "Unauthorized - Bearer token required" });
    }
    if (err.status === 400 && Array.isArray(err.errors)) {
        const details = err.errors.map(e => ({
            path: e.path || e.instancePath || "",
            message: e.message
        }));
        logger.warn(`400 ${req.method} ${req.originalUrl}`);
        return res.status(400).json({ error: "Bad Request", details });
    }
    logger.error(err.stack || err.message);
    res.status(err.status || 500).json({ error: err.message || "Internal server error." });
});

// --- Server Start ---
app.listen(port, () => {
    console.log(chalk.cyan(art));
    logger.info(`✨ API running at http://localhost:${port} ✨`);
});
