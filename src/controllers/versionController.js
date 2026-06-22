// -----------------------------------------------------------------------------
//
// File: src/controllers/versionController.js
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

const {versionUpdateService} = require("../services/versionUpdateService");

function boolQuery(value) {
    return value === true || String(value || "").toLowerCase() === "true";
}

exports.getVersion = async (req, res, next) => {
    try {
        const response = await versionUpdateService.getVersionStatus({
            refresh: boolQuery(req.query.refresh),
            includePrerelease: boolQuery(req.query.includePrerelease),
            source: req.query.source || "auto"
        });

        res.setHeader("Cache-Control", "private, max-age=30");
        res.json(response);
    } catch (err) {
        next(err);
    }
};
