const router    = require("express").Router();
const { check } = require("express-validator");
const validate  = require("../../middleware/validate");
const ctrl      = require("../../controllers/marketplace/compareController");

router.get(
    "/:creatorName",
    [
        check("creatorName")
            .notEmpty().withMessage("creatorName ist erforderlich.")
    ],
    validate,
    ctrl.compare
);

module.exports = router;
