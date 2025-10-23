const {webhookService} = require("../../services/webhookService");
const withETag = require("../../middleware/etag");

exports.register = withETag(async (req) => {
    const {event, url, secret} = req.body || {};
    const result = await webhookService.register({event, url, secret});
    return {ok: true, webhook: result};
});
