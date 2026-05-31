// -----------------------------------------------------------------------------
//
// File: src/routes/marketplace/resolve.js
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
const {check, body, param} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/resolveController");

router.post(
    "/batch/:alias",
    [
        param("alias").notEmpty().withMessage("Alias is required."),
        body("ids").optional().isArray({max: 50}),
        body("ids.*").optional().isString().isLength({max: 200}),
        body("itemIds").optional().isArray({max: 50}),
        body("itemIds.*").optional().isString().isLength({max: 200}),
        body("alternateIds").optional().isArray({max: 50}),
        body("alternateIds.*.type").optional().isString().isLength({max: 80}),
        body("alternateIds.*.value").optional().isString().isLength({max: 200}),
        body("alternateIds.*.Type").optional().isString().isLength({max: 80}),
        body("alternateIds.*.Value").optional().isString().isLength({max: 200})
    ],
    validate,
    ctrl.resolveBatch
);

router.get(
    "/:alias/:itemId",
    [
        check("alias").notEmpty().withMessage("Alias is required."),
        check("itemId").notEmpty().withMessage("ItemId is required.")
    ],
    validate,
    ctrl.resolveByItemId
);

router.get(
    "/friendly/:alias/:friendlyId",
    [
        check("alias").notEmpty().withMessage("Alias is required."),
        check("friendlyId").notEmpty().withMessage("FriendlyId is required.")
    ],
    validate,
    ctrl.resolveByFriendly
);

module.exports = router;
