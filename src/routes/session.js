const router   = require("express").Router();
const { check } = require("express-validator");
const validate = require("../middleware/validate");
const ctrl     = require("../controllers/sessionController");

router.get(
    "/:alias",
    [
        check("alias")
            .notEmpty().withMessage("Alias ist erforderlich.")
    ],
    validate,
    ctrl.getSession
);

module.exports = router;
