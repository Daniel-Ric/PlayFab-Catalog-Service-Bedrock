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
            .notEmpty().withMessage("Alias is required.")
            .matches(/^[\w-]+$/).withMessage("Alias may only contain letters, numbers, and '-'"),
        check("id")
            .notEmpty().withMessage("ID is required.")
    ],
    validate,
    ctrl.create
);

router.delete(
    "/:alias",
    [
        check("alias")
            .notEmpty().withMessage("Alias is required.")
    ],
    validate,
    ctrl.remove
);

module.exports = router;
