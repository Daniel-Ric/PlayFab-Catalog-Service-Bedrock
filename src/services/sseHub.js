const logger = require("../config/logger");

function getCreatorNamesFromPayload(eventName, payload) {
    if (!payload) return [];
    const names = new Set();
    const ev = String(eventName || "");
    if (Array.isArray(payload.items)) {
        if (ev === "item.updated") {
            for (const it of payload.items) {
                if (!it) continue;
                const before = it.before || it.previous || null;
                const after = it.after || it.current || null;
                if (before && before.creatorName) names.add(String(before.creatorName).toLowerCase());
                if (after && after.creatorName) names.add(String(after.creatorName).toLowerCase());
                if (it.creatorName) names.add(String(it.creatorName).toLowerCase());
            }
        } else if (ev === "item.created" || ev === "item.snapshot") {
            for (const it of payload.items) {
                if (it && it.creatorName) {
                    names.add(String(it.creatorName).toLowerCase());
                }
            }
        }
    }
    if (ev === "creator.trending" && Array.isArray(payload.leaders)) {
        for (const leader of payload.leaders) {
            if (leader && leader.creator) {
                names.add(String(leader.creator).toLowerCase());
            }
        }
    }
    return Array.from(names);
}

class SseHub {
    constructor() {
        this.clients = new Set();
        this.initialized = false;
    }

    init(eventBus) {
        if (this.initialized) return;
        this.initialized = true;
        const events = ["item.snapshot", "item.created", "item.updated", "sale.snapshot", "sale.update", "price.changed", "creator.trending"];
        for (const ev of events) {
            eventBus.on(ev, payload => {
                this.broadcast(ev, payload);
            });
        }
    }

    addClient(res, filters) {
        const client = {res, filters, heartbeat: null};
        const hbMs = filters && typeof filters.heartbeatMs === "number" && filters.heartbeatMs >= 5000 ? filters.heartbeatMs : 25000;
        res.on("close", () => {
            this.removeClient(client);
        });
        client.heartbeat = setInterval(() => {
            if (res.writableEnded || !res.writable) {
                this.removeClient(client);
                return;
            }
            res.write(": heartbeat\n\n");
        }, hbMs);
        this.clients.add(client);
        res.write(`event: ready\ndata: {}\n\n`);
    }

    removeClient(client) {
        if (client.heartbeat) clearInterval(client.heartbeat);
        this.clients.delete(client);
    }

    matchesFilter(filters, eventName, payload) {
        if (!filters) return true;
        if (filters.events && filters.events.size && !filters.events.has(eventName)) return false;
        if (filters.creatorNames && filters.creatorNames.size) {
            const names = getCreatorNamesFromPayload(eventName, payload);
            if (names.length) {
                const any = names.some(name => filters.creatorNames.has(name));
                if (!any) return false;
            }
        }
        return true;
    }

    broadcast(eventName, payload) {
        const frameData = JSON.stringify({event: eventName, data: payload});
        const line = `event: ${eventName}\ndata: ${frameData}\n\n`;
        for (const client of Array.from(this.clients)) {
            const res = client.res;
            if (!res.writable || res.writableEnded) {
                this.removeClient(client);
                continue;
            }
            if (!this.matchesFilter(client.filters, eventName, payload)) continue;
            try {
                res.write(line);
            } catch {
                logger.debug(`[SSE] write error event=${eventName}`);
                this.removeClient(client);
            }
        }
    }
}

const sseHub = new SseHub();

function initSseHub(eventBus) {
    sseHub.init(eventBus);
}

module.exports = {sseHub, initSseHub};
