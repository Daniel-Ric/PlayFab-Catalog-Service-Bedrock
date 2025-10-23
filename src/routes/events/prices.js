const router = require("express").Router();
const ctrl = require("../../controllers/events/pricesStreamController");
router.get("/stream", ctrl.stream);
module.exports = router;
