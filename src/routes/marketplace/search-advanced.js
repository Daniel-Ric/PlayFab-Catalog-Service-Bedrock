const router = require("express").Router();
const { body, query, param } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/searchAdvancedController");

router.post(
    "/:alias",
    [
        param("alias").notEmpty(),
        query("page").optional().isInt({ min: 1 }),
        query("pageSize").optional().isInt({ min: 1, max: 100 }),
        body("query").optional().isString().isLength({ max: 200 }),
        body("filters").optional().isObject(),
        body("filters.tags").optional().isArray(),
        body("filters.creatorIds").optional().isArray(),
        body("filters.creatorName").optional().isString(),
        body("filters.priceMin").optional().isInt({ min: 0 }),
        body("filters.priceMax").optional().isInt({ min: 0 }),
        body("filters.createdFrom").optional().isISO8601(),
        body("filters.createdTo").optional().isISO8601(),
        body("filters.contentTypes").optional().isArray(),
        body("sort").optional().isArray()
    ],
    validate,
    ctrl.searchAdvanced
);

module.exports = router;
