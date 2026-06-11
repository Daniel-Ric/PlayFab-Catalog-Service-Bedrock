// -----------------------------------------------------------------------------
//
// File: src/routes/marketplace/search.js
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
const {check, body, query, param} = require("express-validator");
const validate = require("../../middleware/validate");
const ctrl = require("../../controllers/marketplace/searchController");
const dateQuery = require("./dateQuery");
const listOptionsQuery = require("./listOptionsQuery");

const searchBodyValidators = [
    body("search").optional().isString().isLength({max: 200}),
    body("Search").optional().isString().isLength({max: 200}),
    body("query").optional().isObject(),
    body("query.text").optional().isString().isLength({max: 200}),
    body("filter").optional().isString().isLength({max: 2000}),
    body("Filter").optional().isString().isLength({max: 2000}),
    body("orderBy").optional().isString().isLength({max: 500}),
    body("OrderBy").optional().isString().isLength({max: 500}),
    body("select").optional().isString().isLength({max: 500}),
    body("Select").optional().isString().isLength({max: 500}),
    body("language").optional().isString().isLength({max: 40}),
    body("Language").optional().isString().isLength({max: 40}),
    body("count").optional().isInt({min: 1, max: 50}),
    body("Count").optional().isInt({min: 1, max: 50}),
    body("continuationToken").optional().isString().isLength({max: 3000}),
    body("ContinuationToken").optional().isString().isLength({max: 3000}),
    body("store").optional().isObject(),
    body("Store").optional().isObject(),
    body("storeId").optional().isString().isLength({max: 200}),
    body("StoreId").optional().isString().isLength({max: 200}),
    body("storeAlternateId").optional().custom(v => typeof v === "string" || (v && typeof v === "object" && !Array.isArray(v))),
    body("StoreAlternateId").optional().custom(v => typeof v === "string" || (v && typeof v === "object" && !Array.isArray(v))),
    body("storeAlternateIdType").optional().isString().isLength({max: 80}),
    body("StoreAlternateIdType").optional().isString().isLength({max: 80}),
    body("includeRaw").optional().isBoolean()
];

router.post(
    "/items/:alias",
    [
        param("alias").notEmpty().withMessage("Alias is required."),
        ...searchBodyValidators
    ],
    validate,
    ctrl.searchItems
);

router.post(
    "/store/:alias",
    [
        param("alias").notEmpty().withMessage("Alias is required."),
        ...searchBodyValidators
    ],
    validate,
    ctrl.searchStore
);

router.get(
    "/suggest/:alias",
    [
        param("alias").notEmpty().withMessage("Alias is required."),
        query("q").trim().notEmpty().isLength({max: 100}).withMessage("q is required."),
        query("language").optional().isString().isLength({max: 40}),
        query("filter").optional().isString().isLength({max: 1000}),
        query("count").optional().isInt({min: 1, max: 20})
    ],
    validate,
    ctrl.suggest
);

router.post(
    "/localized/:alias",
    [
        param("alias").notEmpty().withMessage("Alias is required."),
        ...searchBodyValidators,
        body("languages").optional().isArray({max: 8}),
        body("languages.*").optional().isString().isLength({max: 40})
    ],
    validate,
    ctrl.localizedSearch
);

router.post(
    "/audit/:alias",
    [
        param("alias").notEmpty().withMessage("Alias is required."),
        ...searchBodyValidators,
        body("languages").optional().isArray({max: 8}),
        body("languages.*").optional().isString().isLength({max: 40}),
        body("maxPages").optional().isInt({min: 1, max: 10})
    ],
    validate,
    ctrl.searchAudit
);

router.get(
    "/:alias",
    [
        check("alias").notEmpty().withMessage("Alias is required."),
        check("creatorName").optional().isString().isLength({max: 200}),
        check("keyword").trim().notEmpty().withMessage("keyword is required."),
        check("page").optional().isInt({min: 1}),
        check("pageSize").optional().isInt({min: 1, max: 100}),
        check("skip").optional().isInt({min: 0}),
        check("limit").optional().isInt({min: 1, max: 1000}),
        check("orderBy").optional().isString().isLength({max: 200}),
        check("contentType").optional().isString().isLength({max: 200}),
        ...listOptionsQuery,
        ...dateQuery
    ],
    validate,
    ctrl.search
);

module.exports = router;
