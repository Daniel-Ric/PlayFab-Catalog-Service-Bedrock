const router   = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl     = require("../../controllers/marketplace/searchController");

router.get(
    "/:alias",
    [
        check("alias")
            .notEmpty().withMessage("Alias ist erforderlich."),
        check("creatorName")
            .notEmpty().withMessage("creatorName ist erforderlich."),
        check("keyword")
            .notEmpty().withMessage("keyword ist erforderlich.")
    ],
    validate,
    ctrl.search
);

module.exports = router;
