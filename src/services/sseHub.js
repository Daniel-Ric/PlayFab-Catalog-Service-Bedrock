const logger = require("../config/logger");
const {getCreatorNamesFromPayload} = require("../utils/eventPayload");

class SseHub {
    constructor() {
        this.clients = new Set();
        this.initialized = false;
        this.seq = 0;
    }

    init(eventBus) {
        if (this.initialized) return;
        this.initialized = true;
        const events = ["item.snapshot", "item.created", "item.updated", "sale.snapshot", "sale.update", "price.changed", "creator.trending"];
        for (const ev of events) {
            eventBus.on(ev, payload => this.broadcast(ev, payload));
        }
    }

    addClient(res, filters) {
        const client = {res, filters, heartbeat: null};
        const hbMs = filters && typeof filters.heartbeatMs === "number" && filters.heartbeatMs >= 5000 ? filters.heartbeatMs : 25000;

        res.on("close", () => this.removeClient(client));

        if (typeof res.flushHeaders === "function") res.flushHeaders();

        client.heartbeat = setInterval(() => {
            if (res.writableEnded || !res.writable) {
                this.removeClient(client);
                return;
            }
            try {
                res.write(": heartbeat\n\n");
            } catch {
                this.removeClient(client);
            }
        }, hbMs);

        this.clients.add(client);
        res.write("event: ready\ndata: {}\n\n");
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
            if (!names.length) return false;
            for (const n of names) {
                if (filters.creatorNames.has(n)) return true;
            }
            return false;
        }

        return true;
    }

    broadcast(eventName, payload) {
        if (!this.clients.size) return;

        const id = (payload && typeof payload.ts === "number" ? String(payload.ts) : String(Date.now())) + "-" + String(++this.seq);
        const frameData = JSON.stringify({event: eventName, data: payload});
        const line = `id: ${id}\nevent: ${eventName}\ndata: ${frameData}\n\n`;

        for (const client of this.clients) {
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
