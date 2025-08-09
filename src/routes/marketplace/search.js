const router   = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl     = require("../../controllers/marketplace/searchController");

router.get(
    "/:alias",
    [
        check("alias")
            .notEmpty().withMessage("Alias is required."),
        check("creatorName")
            .notEmpty().withMessage("creatorName is required."),
        check("keyword")
            .notEmpty().withMessage("keyword is required.")
    ],
    validate,
    ctrl.search
);

module.exports = router;
