const { validationResult } = require("express-validator");

/**
 * Middleware, um express-validator-Errors abzufangen.
 */
module.exports = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};
