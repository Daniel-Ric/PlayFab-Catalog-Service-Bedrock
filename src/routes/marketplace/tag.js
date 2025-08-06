const router   = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl     = require("../../controllers/marketplace/tagController");

router.get(
    "/:alias/:tag",
    [
        check("alias").notEmpty().withMessage("Alias ist erforderlich."),
        check("tag").notEmpty().withMessage("Tag ist erforderlich.")
    ],
    validate,
    ctrl.getByTag
);

module.exports = router;
