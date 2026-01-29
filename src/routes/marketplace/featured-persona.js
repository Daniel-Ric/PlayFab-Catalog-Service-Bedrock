const router = require("express").Router();
const ctrl = require("../../controllers/marketplace/featuredPersonaController");

router.get("/", ctrl.getFeaturedPersona);

module.exports = router;
