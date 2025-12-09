const logger = require("../config/logger");

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
        if (filters.creatorNames && filters.creatorNames.size && payload && Array.isArray(payload.items)) {
            const any = payload.items.some(it => {
                const name = it && it.creatorName ? String(it.creatorName).toLowerCase() : null;
                return name && filters.creatorNames.has(name);
            });
            if (!any) return false;
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
