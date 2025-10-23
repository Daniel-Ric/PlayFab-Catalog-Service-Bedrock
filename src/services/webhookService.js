const fs = require("fs");
const path = require("path");
const axios = require("axios");
const {stableHash} = require("../utils/hash");
const {readJson, writeJsonAtomic} = require("../utils/storage");
const {eventBus} = require("./eventBus");
const logger = require("../config/logger");

const file = path.join(__dirname, "..", "data", "webhooks.json");

class WebhookService {
    constructor() {
        this.hooks = [];
        this.inflight = new Map();
        this.load();
        eventBus.on("sale.update", p => this.dispatch("sale.update", p));
        eventBus.on("item.snapshot", p => this.dispatch("item.snapshot", p));
        eventBus.on("item.created", p => this.dispatch("item.created", p));
        eventBus.on("item.updated", p => this.dispatch("item.updated", p));
        eventBus.on("price.changed", p => this.dispatch("price.changed", p));
        eventBus.on("creator.trending", p => this.dispatch("creator.trending", p));
    }

    load() {
        try {
            this.hooks = readJson(file, []);
        } catch {
            this.hooks = [];
        }
    }

    persist() {
        try {
            writeJsonAtomic(file, this.hooks);
        } catch {
        }
    }

    async register({event, url, secret}) {
        if (!event || !url) throw new Error("event and url required");
        const id = stableHash({event, url, secret: secret || ""});
        const now = Date.now();
        const existing = this.hooks.find(h => h.id === id);
        const hook = existing ? existing : {
            id,
            event,
            url,
            secret: secret || null,
            createdAt: now,
            updatedAt: now,
            failures: 0,
            lastStatus: null
        };
        hook.updatedAt = now;
        if (!existing) this.hooks.push(hook);
        this.persist();
        return hook;
    }

    async dispatch(event, payload) {
        const list = this.hooks.filter(h => h.event === event);
        if (!list.length) return;
        const key = stableHash({event, payload});
        if (this.inflight.has(key)) return;
        const p = this.sendAll(list, event, payload).finally(() => this.inflight.delete(key));
        this.inflight.set(key, p);
        return p;
    }

    async sendAll(list, event, payload) {
        const concurrency = Math.max(1, parseInt(process.env.WEBHOOK_CONCURRENCY || "4", 10));
        for (let i = 0; i < list.length; i += concurrency) {
            const chunk = list.slice(i, i + concurrency);
            await Promise.all(chunk.map(h => this.deliver(h, event, payload)));
        }
    }

    async deliver(hook, event, payload) {
        const body = {event, ts: Date.now(), payload};
        const headers = {"Content-Type": "application/json"};
        if (hook.secret) headers["X-Webhook-Signature"] = stableHash({body, secret: hook.secret});
        const maxRetries = Math.max(0, parseInt(process.env.WEBHOOK_MAX_RETRIES || "3", 10));
        let attempt = 0;
        let lastErr = null;
        while (attempt <= maxRetries) {
            try {
                const r = await axios.post(hook.url, body, {
                    timeout: Math.max(2000, parseInt(process.env.WEBHOOK_TIMEOUT_MS || "5000", 10)),
                    headers,
                    validateStatus: () => true
                });
                hook.lastStatus = r.status;
                hook.failures = r.status >= 200 && r.status < 300 ? 0 : hook.failures + 1;
                hook.updatedAt = Date.now();
                this.persist();
                if (r.status >= 200 && r.status < 300) return;
                lastErr = new Error(String(r.status));
            } catch (e) {
                lastErr = e;
            }
            await new Promise(r => setTimeout(r, Math.min(10000, Math.pow(2, attempt) * 250 + Math.floor(Math.random() * 250))));
            attempt += 1;
        }
        logger.debug(`[Webhook] failure ${hook.url} ${lastErr ? (lastErr.message || "err") : "err"}`);
    }
}

const webhookService = new WebhookService();
module.exports = {webhookService};
