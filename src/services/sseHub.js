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
    constructor(options = {}) {
        this.clients = new Set();
        this.clientsByKey = new Map();
        this.initialized = false;
        this.seq = 0;
        this.maxClients = this.readPositiveInt(options.maxClients, process.env.SSE_MAX_CLIENTS, 1000);
        this.maxClientsPerKey = this.readPositiveInt(options.maxClientsPerKey, process.env.SSE_MAX_CLIENTS_PER_IDENTITY, 100);
        this.maxQueueBytes = this.readPositiveInt(options.maxQueueBytes, process.env.SSE_MAX_QUEUE_BYTES, 32 * 1024 * 1024);
        this.drainTimeoutMs = this.readPositiveInt(options.drainTimeoutMs, process.env.SSE_DRAIN_TIMEOUT_MS, 30000);
    }

    readPositiveInt(optionValue, envValue, fallback) {
        const value = typeof optionValue === "undefined" ? envValue : optionValue;
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    init(eventBus) {
        if (this.initialized) return;
        this.initialized = true;
        for (const ev of EVENT_NAMES) {
            eventBus.on(ev, payload => this.broadcast(ev, payload));
        }
    }

    addClient(res, filters, clientKey = "unknown") {
        const key = String(clientKey || "unknown");
        if (this.clients.size >= this.maxClients) {
            const error = new Error("SSE connection capacity reached.");
            error.status = 503;
            error.publicMessage = error.message;
            throw error;
        }
        if ((this.clientsByKey.get(key) || 0) >= this.maxClientsPerKey) {
            const error = new Error("Too many SSE connections.");
            error.status = 429;
            error.publicMessage = error.message;
            throw error;
        }

        const client = {res, filters, key, heartbeat: null, drainTimer: null, blocked: false, queue: [], queueBytes: 0};
        const envHeartbeatMs = Math.max(5000, this.readPositiveInt(undefined, process.env.SSE_HEARTBEAT_MS, 15000));
        const hbMs = filters && typeof filters.heartbeatMs === "number" && filters.heartbeatMs >= 5000 ? filters.heartbeatMs : envHeartbeatMs;

        client.onClose = () => this.removeClient(client);
        client.onError = () => this.terminateClient(client);
        client.onDrain = () => {
            clearTimeout(client.drainTimer);
            client.drainTimer = null;
            client.blocked = false;
            while (client.queue.length && !client.blocked && this.clients.has(client)) {
                const line = client.queue.shift();
                client.queueBytes -= Buffer.byteLength(line);
                this.write(client, line);
            }
        };
        res.on("close", client.onClose);
        res.on("error", client.onError);
        res.on("drain", client.onDrain);

        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        if (typeof res.flushHeaders === "function") res.flushHeaders();

        client.heartbeat = setInterval(() => {
            if (res.writableEnded || !res.writable) {
                this.removeClient(client);
                return;
            }
            if (!client.blocked) this.write(client, ": heartbeat\n\n");
        }, hbMs);

        this.clients.add(client);
        this.clientsByKey.set(key, (this.clientsByKey.get(key) || 0) + 1);
        this.write(client, "event: ready\ndata: {}\n\n");
        return client;
    }

    removeClient(client) {
        if (client.heartbeat) clearInterval(client.heartbeat);
        clearTimeout(client.drainTimer);
        client.heartbeat = null;
        client.drainTimer = null;
        client.queue = [];
        client.queueBytes = 0;
        client.res.removeListener("close", client.onClose);
        client.res.removeListener("error", client.onError);
        client.res.removeListener("drain", client.onDrain);
        if (!this.clients.delete(client)) return;
        const count = this.clientsByKey.get(client.key) || 0;
        if (count <= 1) this.clientsByKey.delete(client.key);
        else this.clientsByKey.set(client.key, count - 1);
    }

    terminateClient(client) {
        this.removeClient(client);
        const res = client.res;
        if (typeof res.destroy === "function") res.destroy();
        else if (!res.writableEnded && typeof res.end === "function") res.end();
    }

    write(client, line) {
        if (!this.clients.has(client)) return;
        if (client.blocked) {
            client.queue.push(line);
            client.queueBytes += Buffer.byteLength(line);
            if (client.queueBytes > this.maxQueueBytes) {
                logger.warn("[SSE] closing client after pending event queue exceeded its limit");
                this.terminateClient(client);
            }
            return;
        }
        try {
            if (!client.res.write(line)) {
                client.blocked = true;
                client.drainTimer = setTimeout(() => {
                    logger.warn("[SSE] closing client after write buffer failed to drain");
                    this.terminateClient(client);
                }, this.drainTimeoutMs);
                client.drainTimer.unref?.();
            }
            if (typeof client.res.flush === "function") client.res.flush();
        } catch {
            this.terminateClient(client);
        }
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
            this.write(client, line);
        }
    }
}

const sseHub = new SseHub();

function initSseHub(eventBus) {
    sseHub.init(eventBus);
}

module.exports = {SseHub, sseHub, initSseHub};
