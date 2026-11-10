// -----------------------------------------------------------------------------
//
// File: src/routes/marketplace/creator-pages.js
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
const {param, query} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/creatorPagesController");

router.get(
    "/:alias",
    [
        param("alias").notEmpty().withMessage("Alias is required."),
        query("creatorName").optional().isString().bail().trim().notEmpty(),
        query("page").optional().isInt({min: 1}),
        query("pageSize").optional().isInt({min: 1, max: 100}),
        query("skip").optional().isInt({min: 0}),
        query("limit").optional().isInt({min: 1, max: 1000})
    ],
    validate,
    ctrl.getAll
);

module.exports = router;
