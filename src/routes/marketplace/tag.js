const router   = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl     = require("../../controllers/marketplace/tagController");

router.get(
    "/:alias/:tag",
    [
        check("alias").notEmpty().withMessage("Alias not found."),
        check("tag").notEmpty().withMessage("Tag is required.")
    ],
    validate,
    ctrl.getByTag
);

module.exports = router;
