// -----------------------------------------------------------------------------
//
// File: src/controllers/webhookController.js
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
const service = require("../services/webhookService");

const timeoutMs = Math.max(1000, parseInt(process.env.WEBHOOK_TIMEOUT_MS || "6000", 10));

function isDiscordWebhook(webhook) {
    if (!webhook) return false;
    const vendor = String(webhook.vendor || "").toLowerCase();
    if (vendor === "discord") return true;
    const url = String(webhook.url || "").toLowerCase();
    if (!url) return false;
    return url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks");
}

exports.list = (req, res, next) => {
    try {
        res.json(service.listWebhooks());
    } catch (e) {
        next(e);
    }
};

exports.getOne = (req, res, next) => {
    try {
        const w = service.getWebhook(req.params.id);
        if (!w) return res.status(404).json({error: "Webhook not found"});
        res.json(w);
    } catch (e) {
        next(e);
    }
};

exports.create = (req, res, next) => {
    try {
        const w = service.createWebhook(req.body);
        res.status(201).json(w);
    } catch (e) {
        next(e);
    }
};

exports.update = (req, res, next) => {
    try {
        const w = service.updateWebhook(req.params.id, req.body);
        res.json(w);
    } catch (e) {
        next(e);
    }
};

exports.remove = (req, res, next) => {
    try {
        const ok = service.deleteWebhook(req.params.id);
        if (!ok) return res.status(404).json({error: "Webhook not found"});
        res.json({deleted: true});
    } catch (e) {
        next(e);
    }
};

exports.test = async (req, res, next) => {
    try {
        const w = service.getWebhook(req.params.id);
        if (!w) return res.status(404).json({error: "Webhook not found"});

        const deliveryId = crypto.randomBytes(16).toString("hex");
        const eventName = "webhook.test";
        const timestamp = new Date().toISOString();

        let payload;
        if (isDiscordWebhook(w)) {
            const lines = [];
            lines.push("Test webhook delivery");
            lines.push(`Event: ${eventName}`);
            lines.push(`Webhook ID: ${w.id}`);
            lines.push(`Timestamp: ${timestamp}`);
            payload = {content: lines.join("\n")};
        } else {
            payload = {
                id: deliveryId,
                timestamp,
                event: eventName,
                data: {type: "test", message: "Test webhook delivery", webhookId: w.id, url: w.url}
            };
        }

        const json = JSON.stringify(payload);
        const headers = {
            "Content-Type": "application/json",
            "User-Agent": "ViewMarketplace/Webhook",
            "X-View-Event": eventName,
            "X-View-Delivery": deliveryId
        };

        if (w.secret) {
            const sig = crypto.createHmac("sha256", w.secret).update(json).digest("hex");
            headers["X-View-Signature"] = "sha256=" + sig;
        }

        const response = await axios.post(w.url, json, {
            headers,
            timeout: timeoutMs,
            maxBodyLength: 2 * 1024 * 1024,
            maxContentLength: 2 * 1024 * 1024,
            validateStatus: () => true
        });

        res.json({
            id: deliveryId,
            status: response.status,
            ok: response.status >= 200 && response.status < 300,
            event: eventName
        });
    } catch (e) {
        next(e);
    }
};
