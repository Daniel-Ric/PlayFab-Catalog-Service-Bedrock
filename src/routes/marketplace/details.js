const router = require("express").Router();
const {check} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/detailsController");

router.get(
    "/:alias/:itemId",
    [
        check("alias")
            .notEmpty().withMessage("Alias is required."),
        check("itemId")
            .notEmpty().withMessage("ItemId is required.")
    ],
    validate,
    ctrl.getDetails
);

module.exports = router;
