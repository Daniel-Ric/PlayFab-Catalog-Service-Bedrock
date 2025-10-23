const {eventBus} = require("../../services/eventBus");

exports.stream = async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const pingMs = Math.max(5000, parseInt(process.env.SSE_HEARTBEAT_MS || "15000", 10));
    let alive = true;
    const write = (evt, data) => {
        if (!alive) return;
        res.write(`event: ${evt}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    const onUpdate = (payload) => write("sale.update", payload);
    const onSnapshot = (payload) => write("sale.snapshot", payload);
    eventBus.on("sale.update", onUpdate);
    eventBus.on("sale.snapshot", onSnapshot);
    const timer = setInterval(() => write("ping", {t: Date.now()}), pingMs);
    req.on("close", () => {
        alive = false;
        clearInterval(timer);
        eventBus.off("sale.update", onUpdate);
        eventBus.off("sale.snapshot", onSnapshot);
        res.end();
    });
    write("ready", {ok: true});
};
