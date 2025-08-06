const router   = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl     = require("../../controllers/marketplace/allController");

router.get(
    "/:alias",
    [
        check("alias").notEmpty().withMessage("Alias ist erforderlich.")
    ],
    validate,
    ctrl.getAll
);

module.exports = router;
