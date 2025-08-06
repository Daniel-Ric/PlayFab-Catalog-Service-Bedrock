require("dotenv").config();

const express       = require("express");
const bodyParser    = require("body-parser");
const compression   = require("compression");
const cors          = require("cors");

const logger        = require("./config/logger");
const rateLimiter   = require("./config/rateLimiter");
const requestLogger = require("./middleware/requestLogger");

const titlesRoutes   = require("./routes/titles");
const creatorsRoutes = require("./routes/creators");
const sessionRoutes  = require("./routes/session");    // <— neu

// Marketplace: aufgeteilte Sub-Routen
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

// Optional: Chalk für ASCII-Art
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

// --- Routen ---
app.use("/titles",   titlesRoutes);
app.use("/creators", creatorsRoutes);
app.use("/session",  sessionRoutes);    // <— neu

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
    res.status(404).json({ error: "Route nicht gefunden." });
});

// --- Globaler Fehler-Handler ---
app.use((err, req, res, next) => {
    logger.error(err.stack || err.message);
    res.status(err.status || 500).json({ error: err.message || "Interner Serverfehler." });
});

// --- Server Start ---
app.listen(port, () => {
    console.log(chalk.cyan(art));
    logger.info(`✨ API läuft auf http://localhost:${port} ✨`);
});
