// -----------------------------------------------------------------------------
//
// File: src/config/logger.js
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

const winston = require("winston");
const chalkImport = require("chalk");
const chalk = chalkImport.default || chalkImport;

const consoleFormat = winston.format.printf(({timestamp, level, message}) => {
    const time = chalk.dim(timestamp);
    switch (level) {
        case "error":
            return `${time} ${chalk.bgRed.white.bold(" ERROR ")} ${chalk.red(message)}`;
        case "warn":
            return `${time} ${chalk.bgYellow.black.bold(" WARN  ")} ${chalk.yellow(message)}`;
        case "info":
            return `${time} ${chalk.bgGreen.black.bold(" INFO  ")} ${chalk.white(message)}`;
        case "debug":
            return `${time} ${chalk.bgBlue.black.bold(" DEBUG ")} ${chalk.gray(message)}`;
        default:
            return `${time} ${chalk.bgMagenta.black.bold(` ${level.toUpperCase()} `)} ${message}`;
    }
});

const transports = [new winston.transports.Console({
    format: winston.format.combine(winston.format.timestamp({format: "HH:mm:ss"}), consoleFormat)
})];

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info", transports
});

module.exports = logger;
