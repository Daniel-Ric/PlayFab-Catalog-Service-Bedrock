const {webhookService} = require("../../services/webhookService");
const withETag = require("../../middleware/etag");

exports.register = withETag(async (req) => {
    const {event, url, secret, provider} = req.body || {};
    const result = await webhookService.register({event, url, secret, provider});
    return {ok: true, webhook: result};
});

exports.list = withETag(async () => {
    const items = await webhookService.list();
    return {items, total: items.length};
});

exports.remove = withETag(async (req) => {
    const id = req.params.id;
    const ok = await webhookService.remove(id);
    if (!ok) {
        const e = new Error("Webhook not found.");
        e.status = 404;
        throw e;
    }
    return {ok: true, deleted: id};
});
