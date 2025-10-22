const router = require("express").Router();
const ctrl = require("../../controllers/marketplace/salesController");

router.get("/", ctrl.getSales);
router.get("/:alias", ctrl.getSales);

module.exports = router;
