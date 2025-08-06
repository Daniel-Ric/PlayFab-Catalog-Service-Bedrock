const express = require("express");
const { check } = require("express-validator");
const validate   = require("../middleware/validate");
const router     = express.Router();
const ctrl       = require("../controllers/titlesController");

router.get("/", ctrl.getAll);

router.post(
    "/",
    [
        check("alias")
            .notEmpty().withMessage("Alias ist erforderlich.")
            .matches(/^[\w-]+$/).withMessage("Alias darf nur aus Buchstaben, Zahlen und '-' bestehen."),
        check("id")
            .notEmpty().withMessage("ID ist erforderlich.")
    ],
    validate,
    ctrl.create
);

router.delete(
    "/:alias",
    [
        check("alias")
            .notEmpty().withMessage("Alias ist erforderlich.")
    ],
    validate,
    ctrl.remove
);

module.exports = router;
