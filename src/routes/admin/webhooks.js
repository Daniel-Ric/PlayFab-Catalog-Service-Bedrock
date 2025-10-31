const router = require("express").Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/admin/webhooksController");

router.post(
    "/",
    [
        body("event").notEmpty().isString(),
        body("url").notEmpty().isURL(),
        body("secret").optional().isString().isLength({ max: 256 }),
        body("provider").optional().isString().isLength({ max: 32 }),
        body("creator").optional().isString().isLength({ max: 64 })
    ],
    validate,
    ctrl.register
);

router.get(
    "/",
    ctrl.list
);

router.delete(
    "/:id",
    [
        param("id").notEmpty().isString()
    ],
    validate,
    ctrl.remove
);

module.exports = router;
