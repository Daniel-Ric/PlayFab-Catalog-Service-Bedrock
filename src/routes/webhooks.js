const router = require("express").Router();
const {body, param} = require("express-validator");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/webhookController");

const eventsMaxLen = 50;

router.get("/", ctrl.list);

router.post("/", [body("url").isURL({require_tld: false}).withMessage("url is required."), body("events").optional().isArray({
    min: 1,
    max: eventsMaxLen
}), body("events.*").optional().isString(), body("secret").optional().isString().isLength({max: 200}), body("active").optional().isBoolean(), body("vendor").optional().isString().isLength({max: 100}), body("filters").optional().isObject(), body("filters.creators").optional().isArray(), body("filters.creators.*").optional().isString()], validate, ctrl.create);

router.get("/:id", [param("id").notEmpty()], validate, ctrl.getOne);

router.patch("/:id", [param("id").notEmpty(), body("url").optional().isURL({require_tld: false}), body("events").optional().isArray({
    min: 1,
    max: eventsMaxLen
}), body("events.*").optional().isString(), body("secret").optional().isString().isLength({max: 200}), body("active").optional().isBoolean(), body("vendor").optional().isString().isLength({max: 100}), body("filters").optional().isObject(), body("filters.creators").optional().isArray(), body("filters.creators.*").optional().isString()], validate, ctrl.update);

router.delete("/:id", [param("id").notEmpty()], validate, ctrl.remove);

module.exports = router;
