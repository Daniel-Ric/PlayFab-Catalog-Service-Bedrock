const router = require("express").Router();
const {body, param} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/playerSearchController");

router.post(
    "/:alias",
    [
        param("alias").notEmpty(),
        body("entityToken").optional().isString().isLength({min: 1, max: 4096}),
        body("titleEntityToken").optional().isString().isLength({min: 1, max: 4096}),
        body("masterEntityToken").optional().isString().isLength({min: 1, max: 4096}),
        body("titlePlayerAccountId").optional().isString().isLength({min: 1, max: 200}),
        body("creatorName").optional().isString().isLength({max: 200}),
        body("filter").optional().isString().isLength({max: 2000}),
        body("search").optional().isString().isLength({max: 200}),
        body("orderBy").optional().isString().isLength({max: 200}),
        body("top").optional().isInt({min: 1, max: 300}),
        body("skip").optional().isInt({min: 0}),
        body("select").optional().isString().isLength({max: 200}),
        body("expand").optional().isString().isLength({max: 200}),
        body().custom((value) => {
            const entityToken = typeof value?.entityToken === "string" ? value.entityToken.trim() : "";
            const titleEntityToken = typeof value?.titleEntityToken === "string" ? value.titleEntityToken.trim() : "";
            const masterEntityToken = typeof value?.masterEntityToken === "string" ? value.masterEntityToken.trim() : "";
            const titlePlayerAccountId = typeof value?.titlePlayerAccountId === "string" ? value.titlePlayerAccountId.trim() : "";
            if (entityToken && titleEntityToken && entityToken !== titleEntityToken) {
                throw new Error("Entity tokens do not match.");
            }
            if (entityToken || titleEntityToken) return true;
            if (masterEntityToken && titlePlayerAccountId) return true;
            throw new Error("Entity token is required.");
        })
    ],
    validate,
    ctrl.searchPlayerMarketplace
);

module.exports = router;
