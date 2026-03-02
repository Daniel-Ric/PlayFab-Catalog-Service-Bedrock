// -----------------------------------------------------------------------------
//
// File: src/services/featuredContentWatcher.js
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
const {resolveTitle} = require("../utils/titles");
const {fetchFeaturedPersona} = require("./featuredPersonaService");

function collectFeaturedItems(payload) {
    const out = [];

    const visit = node => {
        if (!node || typeof node !== "object") return;

        if (Array.isArray(node)) {
            for (const entry of node) visit(entry);
            return;
        }

        if (Array.isArray(node.items)) {
            for (const item of node.items) {
                if (item && typeof item === "object" && item.id) out.push(item);
            }
        }

        for (const value of Object.values(node)) visit(value);
    };

    visit(payload);
    return out;
}

function getTitleId() {
    const alias = (process.env.FEATURED_PRIMARY_ALIAS || process.env.DEFAULT_ALIAS || "").trim();
    if (alias) {
        try {
            return resolveTitle(alias);
        } catch {
        }
    }
    return process.env.TITLE_ID || "20CA2";
}

class FeaturedContentWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.lastItemIds = null;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;

        const intervalMs = Math.max(60000, parseInt(process.env.FEATURED_CONTENT_WATCH_INTERVAL_MS || "21600000", 10));

        const run = async () => {
            try {
                const titleId = getTitleId();
                const payload = await fetchFeaturedPersona(titleId);
                const items = collectFeaturedItems(payload);
                const itemIds = new Set(items.map(item => String(item.id)));

                if (!this.lastItemIds) {
                    this.lastItemIds = itemIds;
                    return;
                }

                const newItems = items.filter(item => !this.lastItemIds.has(String(item.id)));
                if (newItems.length) {
                    this.lastItemIds = itemIds;
                    eventBus.emit("featured.content.updated", {
                        ts: Date.now(),
                        addedItemIds: newItems.map(item => item.id),
                        addedItems: newItems,
                        content: payload
                    });
                    return;
                }

                this.lastItemIds = itemIds;
            } catch (e) {
                logger.debug(`[FeaturedContentWatcher] error ${e.message || "err"}`);
            }
        };

        run();
        this.timer = setInterval(run, intervalMs);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const featuredContentWatcher = new FeaturedContentWatcher();
module.exports = {featuredContentWatcher};
