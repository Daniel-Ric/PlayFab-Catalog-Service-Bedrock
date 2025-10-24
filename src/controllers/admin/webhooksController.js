const {webhookService} = require("../../services/webhookService");
const withETag = require("../../middleware/etag");

exports.register = withETag(async (req) => {
    const {event, url, secret, provider} = req.body || {};
    const result = await webhookService.register({event, url, secret, provider});
    return {ok: true, webhook: result};
});
