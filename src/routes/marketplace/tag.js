const router = require("express").Router();
const { check } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/tagController");

router.get(
    "/:alias/:tag",
    [
        check("alias").notEmpty().withMessage("Alias not found."),
        check("tag").notEmpty().withMessage("Tag is required."),
        check("page").optional().isInt({ min: 1 }),
        check("pageSize").optional().isInt({ min: 1, max: 100 }),
        check("skip").optional().isInt({ min: 0 }),
        check("limit").optional().isInt({ min: 1, max: 1000 })
    ],
    validate,
    ctrl.getByTag
);

module.exports = router;
