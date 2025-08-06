const router   = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl     = require("../../controllers/marketplace/detailsController");

router.get(
    "/:alias/:itemId",
    [
        check("alias")
            .notEmpty().withMessage("Alias ist erforderlich."),
        check("itemId")
            .notEmpty().withMessage("ItemId ist erforderlich.")
    ],
    validate,
    ctrl.getDetails
);

module.exports = router;
