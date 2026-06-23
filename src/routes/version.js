// -----------------------------------------------------------------------------
//
// File: src/routes/version.js
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

const express = require("express");
const {query} = require("express-validator");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/versionController");

const router = express.Router();

router.get(
    "/",
    [
        query("refresh").optional().isBoolean().withMessage("refresh must be a boolean.").toBoolean(),
        query("includePrerelease").optional().isBoolean().withMessage("includePrerelease must be a boolean.").toBoolean(),
        query("source").optional().isIn(["auto", "release", "tag"]).withMessage("source must be one of: auto, release, tag.")
    ],
    validate,
    ctrl.getVersion
);

module.exports = router;
