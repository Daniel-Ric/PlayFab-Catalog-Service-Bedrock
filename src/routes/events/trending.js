const router = require("express").Router();
const ctrl = require("../../controllers/events/trendingStreamController");
router.get("/stream", ctrl.stream);
module.exports = router;
