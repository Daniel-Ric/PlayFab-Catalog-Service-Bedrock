const express = require("express");
const { check } = require("express-validator");
const validate = require("../middleware/validate");
const router = express.Router();
const ctrl = require("../controllers/creatorsController");

router.get(
    "/",
    [
        check("page").optional().isInt({ min: 1 }),
        check("pageSize").optional().isInt({ min: 1, max: 100 }),
        check("skip").optional().isInt({ min: 0 }),
        check("limit").optional().isInt({ min: 1, max: 1000 })
    ],
    validate,
    ctrl.getAll
);

module.exports = router;
