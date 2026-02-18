// -----------------------------------------------------------------------------
//
// File: src/services/webhookDispatcher.js
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

const axios = require("axios");
const crypto = require("crypto");
const logger = require("../config/logger");
const {findMatchingWebhooks} = require("./webhookService");
const {EVENT_NAMES} = require("../config/eventNames");

let initialized = false;

const queue = [];
let active = 0;

const maxConcurrency = Math.max(1, parseInt(process.env.WEBHOOK_CONCURRENCY || "5", 10));
const maxRetries = Math.max(0, parseInt(process.env.WEBHOOK_MAX_RETRIES || "5", 10));
const timeoutMs = Math.max(1000, parseInt(process.env.WEBHOOK_TIMEOUT_MS || "6000", 10));
const queueMax = Math.max(100, parseInt(process.env.WEBHOOK_QUEUE_MAX || "10000", 10));

const retryBaseMs = Math.max(50, parseInt(process.env.WEBHOOK_RETRY_BASE_MS || "500", 10));
const retryMaxMs = Math.max(1000, parseInt(process.env.WEBHOOK_RETRY_MAX_MS || "30000", 10));

const DISCORD_MAX_CONTENT = 1800;

function isDiscordWebhook(webhook) {
    if (!webhook) return false;
    const vendor = String(webhook.vendor || "").toLowerCase();
    if (vendor === "discord") return true;
    const url = String(webhook.url || "").toLowerCase();
    if (!url) return false;
    return url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks");
}

function buildDiscordPayload(job) {
    const body = job.body || {};
    const lines = [];
    const eventName = body.event || job.eventName || "event";
    lines.push(`Event: ${eventName}`);
    if (body.timestamp) lines.push(`Timestamp: ${body.timestamp}`);
    if (body.id) lines.push(`Delivery: ${body.id}`);

    if (body.data) {
        let dataStr;
        try {
            dataStr = JSON.stringify(body.data, null, 2);
        } catch {
            dataStr = "[unserializable payload]";
        }

        const baseText = lines.join("\n") + "\n";
        const remaining = DISCORD_MAX_CONTENT - baseText.length - "```json\n\n```".length;
        if (remaining > 0) {
            if (dataStr.length > remaining) dataStr = dataStr.slice(0, remaining - 3) + "...";
            lines.push("```json");
            lines.push(dataStr);
            lines.push("```");
        }
    }

    let content = lines.join("\n");
    if (content.length > DISCORD_MAX_CONTENT) content = content.slice(0, DISCORD_MAX_CONTENT - 3) + "...";
    return {username: "PlayFab Catalog API", content};
}

function clampQueue() {
    while (queue.length > queueMax) queue.shift();
}

function parseRetryAfterMs(headers) {
    if (!headers) return 0;
    const v = headers["retry-after"] || headers["Retry-After"];
    if (!v) return 0;
    const s = String(v).trim();
    const sec = parseInt(s, 10);
    if (Number.isFinite(sec) && sec >= 0) return sec * 1000;
    const ts = Date.parse(s);
    if (Number.isFinite(ts)) {
        const d = ts - Date.now();
        return d > 0 ? d : 0;
    }
    return 0;
}

function computeBackoffMs(attempt) {
    const exp = Math.min(retryMaxMs, retryBaseMs * Math.pow(2, Math.max(0, attempt)));
    const jitter = Math.floor(Math.random() * Math.max(10, Math.floor(exp * 0.2)));
    return Math.min(retryMaxMs, exp + jitter);
}

function scheduleRetry(job, retryAfterMs) {
    const nextAttempt = job.attempt + 1;
    const delay = Math.min(retryMaxMs, Math.max(retryAfterMs || 0, computeBackoffMs(nextAttempt)));
    setTimeout(() => {
        queue.push({...job, attempt: nextAttempt});
        clampQueue();
        processQueue();
    }, delay);
}

async function deliver(job) {
    const payload = isDiscordWebhook(job.webhook) ? buildDiscordPayload(job) : job.body;
    const json = JSON.stringify(payload);

    const headers = {
        "Content-Type": "application/json",
        "User-Agent": "ViewMarketplace/Webhook",
        "X-View-Event": job.eventName,
        "X-View-Delivery": job.deliveryId
    };

    if (job.webhook.secret) {
        const sig = crypto.createHmac("sha256", job.webhook.secret).update(json).digest("hex");
        headers["X-View-Signature"] = "sha256=" + sig;
    }

    try {
        const res = await axios.post(job.webhook.url, json, {
            headers,
            timeout: timeoutMs,
            maxBodyLength: 2 * 1024 * 1024,
            maxContentLength: 2 * 1024 * 1024,
            validateStatus: () => true
        });

        const status = res.status;

        if (status >= 200 && status < 300) {
            logger.debug(`[Webhook] delivery ok id=${job.deliveryId} url=${job.webhook.url} status=${status}`);
            return;
        }

        logger.debug(`[Webhook] delivery status=${status} id=${job.deliveryId} url=${job.webhook.url}`);

        if (job.attempt >= maxRetries) return;

        if (status === 429 || (status >= 500 && status <= 599)) {
            scheduleRetry(job, parseRetryAfterMs(res.headers));
        }
    } catch {
        logger.debug(`[Webhook] delivery error id=${job.deliveryId} url=${job.webhook.url} attempt=${job.attempt}`);
        if (job.attempt >= maxRetries) return;
        scheduleRetry(job, 0);
    }
}

function processQueue() {
    while (active < maxConcurrency && queue.length) {
        const job = queue.shift();
        active += 1;
        deliver(job).finally(() => {
            active -= 1;
            processQueue();
        });
    }
}

function enqueueDeliveries(eventName, payload) {
    const webhooks = findMatchingWebhooks(eventName, payload);
    if (!webhooks.length) return;

    for (const w of webhooks) {
        const deliveryId = crypto.randomBytes(16).toString("hex");
        const body = {id: deliveryId, timestamp: new Date().toISOString(), event: eventName, data: payload};
        queue.push({webhook: w, eventName, body, deliveryId, attempt: 0});
    }

    clampQueue();
    processQueue();
}

function initWebhookDispatcher(eventBus) {
    if (initialized) return;
    initialized = true;

    for (const ev of EVENT_NAMES) {
        eventBus.on(ev, payload => {
            try {
                enqueueDeliveries(ev, payload);
            } catch {
            }
        });
    }
}

module.exports = {initWebhookDispatcher};
