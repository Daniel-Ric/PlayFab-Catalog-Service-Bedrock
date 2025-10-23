module.exports = function sseHeartbeat(intervalMs = 15000) {
    return (req, res, next) => {
        const ms = Math.max(5000, parseInt(intervalMs, 10));
        const timer = setInterval(() => {
            res.write(`event: ping\n`);
            res.write(`data: {}\n\n`);
        }, ms);
        req.on("close", () => clearInterval(timer));
        next();
    };
};
