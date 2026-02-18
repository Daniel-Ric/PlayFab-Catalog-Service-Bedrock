// -----------------------------------------------------------------------------
//
// File: src/routes/marketplace/friendly.js
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

const router = require("express").Router();
const {check} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/friendlyController");

router.get(
    "/:alias/:friendlyId",
    [
        check("alias")
            .notEmpty().withMessage("Alias is required."),
        check("friendlyId")
            .notEmpty().withMessage("FriendlyId is required.")
    ],
    validate,
    ctrl.getByFriendly
);

module.exports = router;
