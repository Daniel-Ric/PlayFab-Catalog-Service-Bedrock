const router = require("express").Router();
const {check} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/statsController");

router.get("/:creatorName/stats", [check("creatorName")
    .notEmpty().withMessage("creatorName is required.")], validate, ctrl.getCreatorStats);

module.exports = router;
