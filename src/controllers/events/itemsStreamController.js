const {eventBus} = require("../../services/eventBus");

exports.stream = async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    let alive = true;
    const write = (evt, data) => {
        if (!alive) return;
        res.write(`event: ${evt}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    const onSnapshot = p => write("item.snapshot", p);
    const onCreated = p => write("item.created", p);
    const onUpdated = p => write("item.updated", p);
    eventBus.on("item.snapshot", onSnapshot);
    eventBus.on("item.created", onCreated);
    eventBus.on("item.updated", onUpdated);
    const ping = setInterval(() => write("ping", {}), Math.max(5000, parseInt(process.env.SSE_HEARTBEAT_MS || "15000", 10)));
    req.on("close", () => {
        alive = false;
        clearInterval(ping);
        eventBus.off("item.snapshot", onSnapshot);
        eventBus.off("item.created", onCreated);
        eventBus.off("item.updated", onUpdated);
        res.end();
    });
    write("ready", {ok: true});
};
