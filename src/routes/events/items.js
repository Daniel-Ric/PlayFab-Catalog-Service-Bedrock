const router = require("express").Router();
const ctrl = require("../../controllers/events/itemsStreamController");
router.get("/stream", ctrl.stream);
module.exports = router;
