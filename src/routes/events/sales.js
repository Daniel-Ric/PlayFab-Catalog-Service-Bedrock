const router = require("express").Router();
const ctrl = require("../../controllers/events/salesStreamController");
router.get("/stream", ctrl.stream);
module.exports = router;
