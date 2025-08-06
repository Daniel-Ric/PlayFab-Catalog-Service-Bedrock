const router = require("express").Router();
const ctrl = require("../../controllers/marketplace/featuredServersController");

router.get("/", ctrl.getFeaturedServers);

module.exports = router;
