// -----------------------------------------------------------------------------
//
// File: src/middleware/requestLogger.js
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

const logger = require("../config/logger");

module.exports = (req, res, next) => {
    req.startTime = Date.now();
    logger.debug(`→ ${req.method} ${req.originalUrl}`);
    res.on("finish", () => {
        const ms = Date.now() - req.startTime;
        logger.debug(`← ${req.method} ${req.originalUrl} ${res.statusCode} – ${ms}ms`);
    });
    next();
};
