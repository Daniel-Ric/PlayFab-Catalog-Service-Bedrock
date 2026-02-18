// -----------------------------------------------------------------------------
//
// File: src/routes/webhooks.js
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
const {body, param} = require("express-validator");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/webhookController");
const {EVENT_NAMES} = require("../config/eventNames");

const eventsMaxLen = 50;

router.get("/", ctrl.list);

router.post("/", [body("url").isURL({require_tld: false}).withMessage("url is required."), body("events").optional().isArray({
    min: 1,
    max: eventsMaxLen
}), body("events.*").optional().isString().trim().notEmpty().isIn([...EVENT_NAMES, "*"]), body("secret").optional().isString(), body("active").optional().isBoolean(), body("vendor").optional().isString().trim(), body("filters").optional().isObject(), body("filters.creators").optional().isArray(), body("filters.creators.*").optional().isString().trim().notEmpty()], validate, ctrl.create);

router.get("/:id", [param("id").notEmpty()], validate, ctrl.getOne);

router.post("/:id/test", [param("id").notEmpty()], validate, ctrl.test);

router.patch("/:id", [param("id").notEmpty(), body("url").optional().isURL({require_tld: false}), body("events").optional().isArray({
    min: 1,
    max: eventsMaxLen
}), body("events.*").optional().isString().trim().notEmpty().isIn([...EVENT_NAMES, "*"]), body("secret").optional().isString(), body("active").optional().isBoolean(), body("vendor").optional().isString().trim(), body("filters").optional().isObject(), body("filters.creators").optional().isArray(), body("filters.creators.*").optional().isString().trim().notEmpty()], validate, ctrl.update);

router.delete("/:id", [param("id").notEmpty()], validate, ctrl.remove);

module.exports = router;
