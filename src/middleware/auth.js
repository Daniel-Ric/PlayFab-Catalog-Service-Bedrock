const jwt = require("jsonwebtoken");

module.exports = (req, _res, next) => {
    const header = req.headers["authorization"];
    if (header && header.startsWith("Bearer ")) {
        const token = header.split(" ")[1];
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
        }
    }
    next();
};
