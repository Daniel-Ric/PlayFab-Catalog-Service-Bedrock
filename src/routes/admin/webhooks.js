const router = require("express").Router();
const { body } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/admin/webhooksController");

router.post(
    "/",
    [
        body("event").notEmpty().isString(),
        body("url").notEmpty().isURL(),
        body("secret").optional().isString().isLength({ max: 256 }),
        body("provider").optional().isString().isLength({ max: 32 })
    ],
    validate,
    ctrl.register
);

module.exports = router;
