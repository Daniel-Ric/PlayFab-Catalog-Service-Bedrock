const router = require("express").Router();
const ctrl = require("../../controllers/marketplace/salesController");

router.get("/", ctrl.getSales);

module.exports = router;
