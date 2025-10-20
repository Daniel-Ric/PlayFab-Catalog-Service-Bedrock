const router = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/resolveController");

router.get(
    "/:alias/:itemId",
    [
        check("alias").notEmpty().withMessage("Alias is required."),
        check("itemId").notEmpty().withMessage("ItemId is required.")
    ],
    validate,
    ctrl.resolveByItemId
);

router.get(
    "/friendly/:alias/:friendlyId",
    [
        check("alias").notEmpty().withMessage("Alias is required."),
        check("friendlyId").notEmpty().withMessage("FriendlyId is required.")
    ],
    validate,
    ctrl.resolveByFriendly
);

module.exports = router;
