"use strict";
const {getCatalogIndexStore} = require("../../services/catalogIndexStore");

function createCatalogIndexRouter(getStore = getCatalogIndexStore, limiter = (_req, _res, next) => next()) {
const router = require("express").Router();
for (const action of ["browse", "home", "coverage", "index-stats"]) {
    router.get(`/${action}`, limiter, (req, res, next) => {
        try {
            const store = getStore();
            store.refreshReader();
            const result = action === "browse" ? store.query(req.query) : action === "home" ? store.index.home(req.query)
                : action === "coverage" ? store.coverage() : store.index.stats();

            res.set("Cache-Control", "no-store");
            res.json(result);
        } catch (error) { next(error); }
    });
}
return router;
}
module.exports = createCatalogIndexRouter();
module.exports.createCatalogIndexRouter = createCatalogIndexRouter;
