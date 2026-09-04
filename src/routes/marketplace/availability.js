// -----------------------------------------------------------------------------
//
// File: src/routes/marketplace/availability.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
//
// -----------------------------------------------------------------------------

const router = require("express").Router();
const {param} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/availabilityController");

router.get(
    "/:alias/:itemId",
    [
        param("alias").notEmpty().withMessage("Alias is required."),
        param("itemId").notEmpty().withMessage("ItemId is required.")
    ],
    validate,
    ctrl.getAvailability
);

module.exports = router;
