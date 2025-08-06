const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/creatorsController");

router.get("/", ctrl.getAll);

module.exports = router;
