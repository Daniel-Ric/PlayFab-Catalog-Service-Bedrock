// -----------------------------------------------------------------------------
//
// File: src/middleware/etag.js
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

const crypto = require("crypto");

function withETag(handler) {
    return async (req, res, next) => {
        try {
            const result = await handler(req, res, next);
            if (res.headersSent) return;
            if (typeof result === "undefined") {
                res.status(204).end();
                return;
            }
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
