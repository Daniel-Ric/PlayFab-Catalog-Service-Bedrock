const router = require("express").Router();
const {body, param} = require("express-validator");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/webhookController");

const eventsMaxLen = 50;

router.get("/", ctrl.list);

router.post("/", [body("url").isURL({require_tld: false}).withMessage("url is required."), body("events").optional().isArray({
    min: 1,
    max: eventsMaxLen
}), body("events.*").optional().isString().trim().notEmpty(), body("secret").optional().isString(), body("active").optional().isBoolean(), body("vendor").optional().isString().trim(), body("filters").optional().isObject(), body("filters.creators").optional().isArray(), body("filters.creators.*").optional().isString().trim().notEmpty()], validate, ctrl.create);

router.get("/:id", [param("id").notEmpty()], validate, ctrl.getOne);

router.post("/:id/test", [param("id").notEmpty()], validate, ctrl.test);

router.patch("/:id", [param("id").notEmpty(), body("url").optional().isURL({require_tld: false}), body("events").optional().isArray({
    min: 1,
    max: eventsMaxLen
}), body("events.*").optional().isString().trim().notEmpty(), body("secret").optional().isString(), body("active").optional().isBoolean(), body("vendor").optional().isString().trim(), body("filters").optional().isObject(), body("filters.creators").optional().isArray(), body("filters.creators.*").optional().isString().trim().notEmpty()], validate, ctrl.update);

router.delete("/:id", [param("id").notEmpty()], validate, ctrl.remove);

module.exports = router;
