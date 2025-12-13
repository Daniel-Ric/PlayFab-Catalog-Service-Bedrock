const {sseHub} = require("../services/sseHub");

function parseEventsParam(raw) {
    if (!raw) return new Set();
    const arr = String(raw).split(",").map(s => s.trim()).filter(Boolean);
    return new Set(arr);
}

exports.stream = (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (typeof res.flushHeaders === "function") res.flushHeaders();

    const eventsSet = parseEventsParam(req.query.events);
    const creatorNames = new Set();
    if (typeof req.query.creatorName === "string" && req.query.creatorName.trim()) {
        creatorNames.add(req.query.creatorName.trim().toLowerCase());
    }

    const heartbeatMsRaw = parseInt(req.query.heartbeatMs, 10);
    const filters = {
        events: eventsSet,
        creatorNames: creatorNames.size ? creatorNames : null,
        heartbeatMs: Number.isFinite(heartbeatMsRaw) ? heartbeatMsRaw : undefined
    };

    sseHub.addClient(res, filters);
};
