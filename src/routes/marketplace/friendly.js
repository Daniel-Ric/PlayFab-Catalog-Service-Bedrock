const router   = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl     = require("../../controllers/marketplace/friendlyController");

router.get(
    "/:alias/:friendlyId",
    [
        check("alias")
            .notEmpty().withMessage("Alias is required."),
        check("friendlyId")
            .notEmpty().withMessage("FriendlyId is required.")
    ],
    validate,
    ctrl.getByFriendly
);

module.exports = router;
