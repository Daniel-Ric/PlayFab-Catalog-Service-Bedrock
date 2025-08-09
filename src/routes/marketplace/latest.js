const router   = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl     = require("../../controllers/marketplace/latestController");

router.get(
    "/:alias",
    [
        check("alias").notEmpty().withMessage("Alias is required.")
    ],
    validate,
    ctrl.getLatest
);

module.exports = router;
