// -----------------------------------------------------------------------------
//
// File: src/routes/events.js
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
const {query} = require("express-validator");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/eventsController");

router.get("/stream", [query("events").optional().isString().isLength({max: 200}), query("creatorName").optional().isString().isLength({max: 100}), query("creatorNames").optional().isString().isLength({max: 400}), query("heartbeatMs").optional().isInt({
    min: 5000,
    max: 600000
})], validate, ctrl.stream);

module.exports = router;
