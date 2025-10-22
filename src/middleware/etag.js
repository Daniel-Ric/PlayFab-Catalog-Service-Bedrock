const crypto = require("crypto");

function withETag(handler) {
    return async (req, res, next) => {
        try {
            const result = await handler(req, res, next);
            if (res.headersSent) return;
            const body = JSON.stringify(result);
            const hash = crypto.createHash("sha1").update(body).digest("hex");
            const tag = `W/"${body.length.toString(16)}-${hash.slice(0, 16)}"`;
            res.setHeader("ETag", tag);
            if (req.headers["if-none-match"] === tag) {
                res.status(304).end();
                return;
            }
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.send(body);
        } catch (e) {
            next(e);
        }
    };
}

module.exports = withETag;
