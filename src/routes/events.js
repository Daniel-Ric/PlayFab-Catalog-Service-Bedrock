const router = require("express").Router();
const {query} = require("express-validator");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/eventsController");

router.get("/stream", [query("events").optional().isString().isLength({max: 200}), query("creatorName").optional().isString().isLength({max: 100}), query("heartbeatMs").optional().isInt({
    min: 5000,
    max: 600000
})], validate, ctrl.stream);

module.exports = router;
