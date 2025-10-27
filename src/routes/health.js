const router = require("express").Router();
const ctrl = require("../controllers/healthController");

router.get("/", ctrl.getHealth);

module.exports = router;
