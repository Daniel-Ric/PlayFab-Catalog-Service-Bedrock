// -----------------------------------------------------------------------------
//
// File: src/services/creatorPartnerWatcher.js
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
const {getTitleId, syncCreatorRegistry} = require("./creatorRegistryService");

function buildCreatorPartnerChangePayload({titleId, previous, current, diff, ts = Date.now()}) {
    const addedPartners = diff?.added || [];
    const removedPartners = diff?.removed || [];
    const changedPartners = diff?.changed || [];
    if (!addedPartners.length && !removedPartners.length && !changedPartners.length) return null;
    return {
        ts,
        titleId,
        addedCount: addedPartners.length,
        removedCount: removedPartners.length,
        changedCount: changedPartners.length,
        totalBefore: Array.isArray(previous) ? previous.length : 0,
        totalAfter: Array.isArray(current) ? current.length : 0,
        addedPartnerIds: addedPartners.map(c => c.id),
        removedPartnerIds: removedPartners.map(c => c.id),
        changedPartnerIds: changedPartners.map(c => c.id),
        addedPartners,
        removedPartners,
        changedPartners,
        currentPartners: current || [],
        previousPartners: previous || []
    };
}

class CreatorPartnerWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.lastRunTs = 0;
        this.bootstrapped = false;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;

        const intervalMs = Math.max(60000, parseInt(process.env.CREATOR_PARTNER_WATCH_INTERVAL_MS || "21600000", 10));

        const run = async () => {
            try {
                const titleId = getTitleId();
                const result = await syncCreatorRegistry(titleId);
                this.lastRunTs = Date.now();

                if (!this.bootstrapped) {
                    this.bootstrapped = true;
                    eventBus.emit("creator.partners.snapshot", {
                        ts: Date.now(), titleId, count: result.current.length, partners: result.current
                    });
                    return;
                }

                const payload = buildCreatorPartnerChangePayload({titleId, ...result});
                if (payload) eventBus.emit("creator.partners.updated", payload);
            } catch (e) {
                logger.debug(`[CreatorPartnerWatcher] error ${e.message || "err"}`);
                this.lastRunTs = Date.now();
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

const creatorPartnerWatcher = new CreatorPartnerWatcher();
module.exports = {
    creatorPartnerWatcher,
    _internals: {
        buildCreatorPartnerChangePayload
    }
};
