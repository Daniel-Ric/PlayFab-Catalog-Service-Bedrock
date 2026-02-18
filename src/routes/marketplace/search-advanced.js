// -----------------------------------------------------------------------------
//
// File: src/routes/marketplace/search-advanced.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
// No partnership, approval, or official relationship with Mojang AB or Microsoft is implied.
//
// All names, logos, brands, trademarks, service marks, and registered trademarks are the
// property of their respective owners and are used strictly for identification/reference only.
// This project does not claim ownership of third-party IP and provides no license to use it.
//
// -----------------------------------------------------------------------------

const router = require("express").Router();
const {body, query, param} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/searchAdvancedController");

router.post(
    "/:alias",
    [
        param("alias").notEmpty(),
        query("page").optional().isInt({min: 1}),
        query("pageSize").optional().isInt({min: 1, max: 100}),
        body("query").optional().isObject(),
        body("query.text").optional().isString().isLength({max: 200}),
        body("filters").optional().isObject(),
        body("filters.id").optional().custom(v => typeof v === "string" || Array.isArray(v)),
        body("filters.friendlyId").optional().custom(v => typeof v === "string" || Array.isArray(v)),
        body("filters.alternateIds").optional().isArray(),
        body("filters.alternateIds.*.type").optional().isString(),
        body("filters.alternateIds.*.value").optional().isString(),
        body("filters.keywords").optional().custom(v => typeof v === "string" || Array.isArray(v)),
        body("filters.isStackable").optional().isBoolean(),
        body("filters.platforms").optional().custom(v => typeof v === "string" || Array.isArray(v)),
        body("filters.tags").optional().custom(v => typeof v === "string" || Array.isArray(v)),
        body("filters.tagsAny").optional().custom(v => typeof v === "string" || Array.isArray(v)),
        body("filters.tagsAll").optional().custom(v => typeof v === "string" || Array.isArray(v)),
        body("filters.contentKinds").optional().custom(v => typeof v === "string" || Array.isArray(v)),
        body("filters.creationDate").optional().isObject(),
        body("filters.creationDate.from").optional().isISO8601(),
        body("filters.creationDate.to").optional().isISO8601(),
        body("filters.lastModifiedDate").optional().isObject(),
        body("filters.lastModifiedDate.from").optional().isISO8601(),
        body("filters.lastModifiedDate.to").optional().isISO8601(),
        body("filters.startDate").optional().isObject(),
        body("filters.startDate.from").optional().isISO8601(),
        body("filters.startDate.to").optional().isISO8601(),
        body("filters.priceAmounts").optional().isObject(),
        body("filters.priceAmounts.min").optional().isFloat({min: 0}),
        body("filters.priceAmounts.max").optional().isFloat({min: 0}),
        body("filters.priceAmounts.currencyId").optional().isString(),
        body("filters.creatorName").optional().isString(),
        body("filters.offerId").optional().isString(),
        body("filters.purchasable").optional().isBoolean(),
        body("filters.packIdentityType").optional().isString(),
        body("filters.ratingMin").optional().isFloat({min: 0}),
        body("sort").optional().isArray(),
        body("sort.*.field").optional().isString(),
        body("sort.*.dir").optional().isIn(["asc", "desc"])
    ],
    validate,
    ctrl.searchAdvanced
);

module.exports = router;
