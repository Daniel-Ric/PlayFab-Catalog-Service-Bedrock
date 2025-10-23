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
    const onTrending = p => write("creator.trending", p);
    eventBus.on("creator.trending", onTrending);
    const ping = setInterval(() => write("ping", {}), Math.max(5000, parseInt(process.env.SSE_HEARTBEAT_MS || "15000", 10)));
    req.on("close", () => {
        alive = false;
        clearInterval(ping);
        eventBus.off("creator.trending", onTrending);
        res.end();
    });
    write("ready", {ok: true});
};
