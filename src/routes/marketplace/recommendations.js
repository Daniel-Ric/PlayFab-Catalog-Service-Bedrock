const router = require("express").Router();
const {check, query} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/recommendationsController");

router.get("/:itemId", [check("itemId")
    .notEmpty().withMessage("itemId is required."), query("limit").optional().isInt({
    min: 1,
    max: 50
})], validate, ctrl.getRecommendations);

module.exports = router;
