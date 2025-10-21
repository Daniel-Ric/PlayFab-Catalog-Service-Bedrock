const router = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/latestController");

router.get(
    "/:alias",
    [
        check("alias").notEmpty().withMessage("Alias is required."),
        check("count").optional().isInt({ min: 1, max: 50 }),
        check("page").optional().isInt({ min: 1 }),
        check("pageSize").optional().isInt({ min: 1, max: 100 }),
        check("skip").optional().isInt({ min: 0 }),
        check("limit").optional().isInt({ min: 1, max: 1000 })
    ],
    validate,
    ctrl.getLatest
);

module.exports = router;
