const {sseHub} = require("../services/sseHub");

function parseEventsParam(raw) {
    if (!raw) return new Set();
    const arr = String(raw).split(",").map(s => s.trim()).filter(Boolean);
    return new Set(arr);
}

function parseCreatorNamesParam(raw) {
    const set = new Set();
    if (typeof raw !== "string" || !raw.trim()) return set;
    const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
    for (const p of parts) set.add(p.toLowerCase());
    return set;
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
    const fromSingle = parseCreatorNamesParam(req.query.creatorName);
    const fromMulti = parseCreatorNamesParam(req.query.creatorNames);
    for (const n of fromSingle) creatorNames.add(n);
    for (const n of fromMulti) creatorNames.add(n);

    const heartbeatMsRaw = parseInt(req.query.heartbeatMs, 10);
    const filters = {
        events: eventsSet,
        creatorNames: creatorNames.size ? creatorNames : null,
        heartbeatMs: Number.isFinite(heartbeatMsRaw) ? heartbeatMsRaw : undefined
    };

    sseHub.addClient(res, filters);
};
