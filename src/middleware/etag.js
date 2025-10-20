const crypto = require("crypto");
const stringify = require("fast-json-stable-stringify");

function withETag(handler) {
    return async (req, res, next) => {
        try {
            const result = await handler(req, res);
            const body = stringify(result);
            const tag = crypto.createHash("md5").update(body).digest("hex");
            res.setHeader("ETag", tag);
            if (req.headers["if-none-match"] === tag) {
                return res.status(304).end();
            }
            res.json(result);
        } catch (e) {
            next(e);
        }
    };
}

module.exports = withETag;
