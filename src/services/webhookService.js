const fs = require("fs");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");
const {stableHash} = require("../utils/hash");
const {readJson, writeJsonAtomic} = require("../utils/storage");
const {eventBus} = require("./eventBus");
const logger = require("../config/logger");

const file = path.join(__dirname, "..", "data", "webhooks.json");

function detectProvider(url, override) {
    if (override && typeof override === "string") return override.toLowerCase();
    try {
        const u = new URL(url);
        const h = u.hostname.toLowerCase();
        if (h.includes("discord.com") || h.includes("discordapp.com")) return "discord";
        if (h.includes("hooks.slack.com")) return "slack";
        if (h.includes("chat.googleapis.com")) return "googlechat";
        if (h.includes("outlook.office.com") || h.includes("office.com") || h.includes("teams.microsoft.com")) return "teams";
        return "generic";
    } catch {
        return "generic";
    }
}

function toPlainText(event, payload) {
    const ts = new Date(payload.ts || Date.now()).toISOString();
    const base = [`event: ${event}`, `ts: ${ts}`];
    if (payload && payload.payload && typeof payload.payload === "object") {
        const p = payload.payload;
        if (event === "sale.update" && Array.isArray(p.changes)) {
            base.push(`changes: ${p.changes.length}`);
        } else if (event === "item.created" && Array.isArray(p.items)) {
            base.push(`created: ${p.items.length}`);
        } else if (event === "item.updated" && Array.isArray(p.items)) {
            base.push(`updated: ${p.items.length}`);
        } else if (event === "price.changed" && Array.isArray(p.changes)) {
            base.push(`priceChanges: ${p.changes.length}`);
        } else if (event === "item.snapshot" && typeof p.count === "number") {
            base.push(`snapshotCount: ${p.count}`);
        } else if (event === "sale.snapshot" && typeof p.stores === "number") {
            base.push(`saleStores: ${p.stores}`);
        } else if (event === "creator.trending" && Array.isArray(p.leaders)) {
            base.push(`leaders: ${p.leaders.length}`);
        }
    }
    return base.join("\n");
}

function buildDiscordBody(event, payload) {
    const ts = new Date(payload.ts || Date.now()).toISOString();
    const p = payload && payload.payload ? payload.payload : {};
    let firstItem = null;

    if (event === "item.created" && Array.isArray(p.items) && p.items.length > 0) {
        firstItem = p.items[0];
    } else if (event === "item.updated" && Array.isArray(p.items) && p.items.length > 0) {
        if (p.items[0].after) firstItem = p.items[0].after;
        else firstItem = p.items[0];
    }

    let titleText = event;
    let creatorName = "";
    let priceText = "";
    let createdAt = "";
    let updatedAt = ts;
    let availableAt = "";
    let thumbUrl = null;
    let heroUrl = null;
    let shortDescLines = [];

    if (firstItem) {
        titleText = firstItem.title || firstItem.id || titleText;
        creatorName = firstItem.creatorName || "";
        priceText = typeof firstItem.price === "number" ? `${firstItem.price} Minecoins` : "N/A";
        createdAt = firstItem.createdAt || "";
        availableAt = firstItem.startDate || firstItem.createdAt || "";

        if (firstItem.thumbnail) thumbUrl = firstItem.thumbnail;

        if (Array.isArray(firstItem.images)) {
            const big = firstItem.images.find(i => i && i.url);
            if (big && big.url) heroUrl = big.url;
        }
        if (!heroUrl && p.items && p.items[0] && p.items[0].thumbnail) {
            heroUrl = p.items[0].thumbnail;
        }

        if (firstItem.description) {
            shortDescLines = String(firstItem.description)
                .split(/\r?\n/)
                .slice(0, 2)
                .map(l => l.trim())
                .filter(Boolean);
        } else {
            shortDescLines = [
                "» New marketplace content detected",
                "» Auto-ingested from PlayFab watcher"
            ];
        }
    } else {
        shortDescLines = [
            "» Automated event payload",
            "» See details below"
        ];
    }

    const headlineParts = [];
    if (titleText) headlineParts.push(titleText);
    if (creatorName) headlineParts.push(`by ${creatorName}`);
    const headline = headlineParts.join(" ");

    const detailsBlock = [
        "Details",
        "```",
        `Price:          ${priceText}`,
        "```"
    ].join("\n");

    function fmtLabelDate(label, value) {
        if (!value) return "";
        return `**${label}**\n${value}\n`;
    }

    const descSections = [
        `**${headline}**`,
        shortDescLines.map(l => `» ${l}`).join("\n"),
        detailsBlock,
        fmtLabelDate("Public Marketplace Upload", createdAt),
        fmtLabelDate("Last updated", updatedAt),
        fmtLabelDate("Public Marketplace Availability", availableAt)
    ].filter(Boolean);

    const description = descSections.join("\n\n");

    const embed = {
        title: headline,
        description,
        timestamp: ts,
        footer: {
            text: "PlayFab Catalog API | By SpindexGFX"
        },
        fields: []
    };

    if (heroUrl) {
        embed.image = { url: heroUrl };
    }

    if (thumbUrl) {
        embed.thumbnail = { url: thumbUrl };
    }

    return {
        content: `Webhook: ${event}`,
        embeds: [embed]
    };
}

function buildSlackBody(event, payload) {
    return {text: toPlainText(event, payload)};
}

function buildGoogleChatBody(event, payload) {
    return {text: toPlainText(event, payload)};
}

function buildTeamsBody(event, payload) {
    const text = toPlainText(event, payload);
    return {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        summary: event,
        themeColor: "0076D7",
        title: event,
        text
    };
}

function buildGenericBody(event, payload) {
    return {event, ts: Date.now(), payload};
}

function signGenericBody(secret, body) {
    const payload = JSON.stringify(body);
    const ts = Date.now().toString();
    const h = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
    return {ts, sig: `sha256=${h}`};
}

class WebhookService {
    constructor() {
        this.hooks = [];
        this.inflight = new Map();
        this.load();
        eventBus.on("sale.update", p => this.dispatch("sale.update", p));
        eventBus.on("sale.snapshot", p => this.dispatch("sale.snapshot", p));
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

    async register({event, url, secret, provider}) {
        if (!event || !url) throw new Error("event and url required");
        const prov = detectProvider(url, provider);
        const id = stableHash({event, url, secret: secret || "", provider: prov});
        const now = Date.now();
        const existing = this.hooks.find(h => h.id === id);
        const hook = existing ? existing : {
            id,
            event,
            url,
            provider: prov,
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

    async list() {
        return this.hooks.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    async remove(id) {
        const before = this.hooks.length;
        this.hooks = this.hooks.filter(h => h.id !== id);
        const changed = this.hooks.length !== before;
        if (changed) this.persist();
        return changed;
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

    buildBodyAndHeaders(hook, event, payload) {
        const provider = hook.provider || detectProvider(hook.url);
        if (provider === "discord") return {
            body: buildDiscordBody(event, {event, ts: Date.now(), payload}),
            headers: {"Content-Type": "application/json"}
        };
        if (provider === "slack") return {
            body: buildSlackBody(event, {event, ts: Date.now(), payload}), headers: {"Content-Type": "application/json"}
        };
        if (provider === "googlechat") return {
            body: buildGoogleChatBody(event, {event, ts: Date.now(), payload}),
            headers: {"Content-Type": "application/json"}
        };
        if (provider === "teams") return {
            body: buildTeamsBody(event, {event, ts: Date.now(), payload}), headers: {"Content-Type": "application/json"}
        };
        const body = buildGenericBody(event, payload);
        const headers = {"Content-Type": "application/json"};
        if (hook.secret) {
            const sig = signGenericBody(hook.secret, body);
            headers["X-Webhook-Timestamp"] = sig.ts;
            headers["X-Webhook-Signature"] = sig.sig;
        }
        return {body, headers};
    }

    async deliver(hook, event, payload) {
        const {body, headers} = this.buildBodyAndHeaders(hook, event, payload);
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
