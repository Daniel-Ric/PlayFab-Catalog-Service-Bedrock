const service = require("../services/webhookService");

exports.list = (req, res, next) => {
    try {
        const items = service.listWebhooks();
        res.json(items);
    } catch (e) {
        next(e);
    }
};

exports.getOne = (req, res, next) => {
    try {
        const w = service.getWebhook(req.params.id);
        if (!w) {
            res.status(404).json({error: "Webhook not found"});
            return;
        }
        res.json(w);
    } catch (e) {
        next(e);
    }
};

exports.create = (req, res, next) => {
    try {
        const w = service.createWebhook(req.body || {});
        res.status(201).json(w);
    } catch (e) {
        next(e);
    }
};

exports.update = (req, res, next) => {
    try {
        const w = service.updateWebhook(req.params.id, req.body || {});
        res.json(w);
    } catch (e) {
        next(e);
    }
};

exports.remove = (req, res, next) => {
    try {
        const ok = service.deleteWebhook(req.params.id);
        if (!ok) {
            res.status(404).json({error: "Webhook not found"});
            return;
        }
        res.json({deleted: true});
    } catch (e) {
        next(e);
    }
};
