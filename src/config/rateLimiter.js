const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 2000,
    message: "Zu viele Anfragen – bitte später erneut versuchen."
});
