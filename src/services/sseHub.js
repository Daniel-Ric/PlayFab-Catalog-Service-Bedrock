// -----------------------------------------------------------------------------
//
// File: src/services/sseHub.js
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

const logger = require("../config/logger");
const {getCreatorNamesFromPayload} = require("../utils/eventPayload");
const {EVENT_NAMES} = require("../config/eventNames");

class SseHub {
    constructor() {
        this.clients = new Set();
        this.initialized = false;
        this.seq = 0;
    }

    init(eventBus) {
        if (this.initialized) return;
        this.initialized = true;
        for (const ev of EVENT_NAMES) {
            eventBus.on(ev, payload => this.broadcast(ev, payload));
        }
    }

    addClient(res, filters) {
        const client = {res, filters, heartbeat: null};
        const envHeartbeatMs = Math.max(5000, parseInt(process.env.SSE_HEARTBEAT_MS || "15000", 10));
        const hbMs = filters && typeof filters.heartbeatMs === "number" && filters.heartbeatMs >= 5000 ? filters.heartbeatMs : envHeartbeatMs;

        res.on("close", () => this.removeClient(client));

        if (typeof res.flushHeaders === "function") res.flushHeaders();

        client.heartbeat = setInterval(() => {
            if (res.writableEnded || !res.writable) {
                this.removeClient(client);
                return;
            }
            try {
                res.write(": heartbeat\n\n");
                if (typeof res.flush === "function") res.flush();
            } catch {
                this.removeClient(client);
            }
        }, hbMs);

        this.clients.add(client);
        res.write("event: ready\ndata: {}\n\n");
        if (typeof res.flush === "function") res.flush();
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
                if (typeof res.flush === "function") res.flush();
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
