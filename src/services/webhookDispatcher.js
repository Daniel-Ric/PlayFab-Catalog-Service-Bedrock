const axios = require("axios");
const crypto = require("crypto");
const logger = require("../config/logger");
const {findMatchingWebhooks} = require("./webhookService");

let initialized = false;
const queue = [];
let active = 0;

const maxConcurrency = Math.max(1, parseInt(process.env.WEBHOOK_CONCURRENCY || "5", 10));
const maxRetries = Math.max(0, parseInt(process.env.WEBHOOK_MAX_RETRIES || "5", 10));
const timeoutMs = Math.max(1000, parseInt(process.env.WEBHOOK_TIMEOUT_MS || "6000", 10));

function scheduleRetry(job) {
    const nextAttempt = job.attempt + 1;
    const delayBase = 500;
    const delay = Math.min(30000, delayBase * Math.pow(2, nextAttempt));
    setTimeout(() => {
        queue.push({...job, attempt: nextAttempt});
        processQueue();
    }, delay);
}

async function deliver(job) {
    const json = JSON.stringify(job.body);
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
            headers, timeout: timeoutMs, validateStatus: () => true
        });
        if (res.status >= 200 && res.status < 300) {
            logger.debug(`[Webhook] delivery ok id=${job.deliveryId} url=${job.webhook.url} status=${res.status}`);
            return;
        }
        const status = res.status;
        logger.debug(`[Webhook] delivery status=${status} id=${job.deliveryId} url=${job.webhook.url}`);
        if (job.attempt >= maxRetries) return;
        if (status >= 500 || status === 429) {
            scheduleRetry(job);
        }
    } catch {
        logger.debug(`[Webhook] delivery error id=${job.deliveryId} url=${job.webhook.url} attempt=${job.attempt}`);
        if (job.attempt >= maxRetries) return;
        scheduleRetry(job);
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
        const body = {
            id: deliveryId, timestamp: new Date().toISOString(), event: eventName, data: payload
        };
        queue.push({
            webhook: w, eventName, body, deliveryId, attempt: 0
        });
    }
    processQueue();
}

function initWebhookDispatcher(eventBus) {
    if (initialized) return;
    initialized = true;
    const events = ["item.snapshot", "item.created", "item.updated", "sale.snapshot", "sale.update", "price.changed", "creator.trending"];
    for (const ev of events) {
        eventBus.on(ev, payload => {
            try {
                enqueueDeliveries(ev, payload);
            } catch {
            }
        });
    }
}

module.exports = {initWebhookDispatcher};
