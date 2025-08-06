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
