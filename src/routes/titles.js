// -----------------------------------------------------------------------------
//
// File: src/routes/titles.js
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
const {check} = require("express-validator");
const validate = require("../middleware/validate");
const router = express.Router();
const ctrl = require("../controllers/titlesController");

router.get("/", ctrl.getAll);

router.post(
    "/",
    [
        check("alias")
            .notEmpty().withMessage("Alias is required.")
            .matches(/^[\w-]+$/).withMessage("Alias may only contain letters, numbers, and '-'"),
        check("id")
            .notEmpty().withMessage("ID is required.")
    ],
    validate,
    ctrl.create
);

router.delete(
    "/:alias",
    [
        check("alias")
            .notEmpty().withMessage("Alias is required.")
    ],
    validate,
    ctrl.remove
);

module.exports = router;
