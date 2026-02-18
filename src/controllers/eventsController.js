// -----------------------------------------------------------------------------
//
// File: src/controllers/eventsController.js
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

const {sseHub} = require("../services/sseHub");
const {EVENT_NAME_SET} = require("../config/eventNames");

function parseEventsParam(raw) {
    if (!raw) return new Set();
    const arr = String(raw).split(",").map(s => s.trim()).filter(Boolean).filter(s => EVENT_NAME_SET.has(s));
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
