// -----------------------------------------------------------------------------
//
// File: src/utils/watcherRun.js
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

function createNonOverlappingRunner({run, onError, onSkip, skipLogIntervalMs = 60000, now = () => Date.now()}) {
    let inFlight = false;
    let lastSkipLogTs = 0;

    return async function runOnce() {
        if (inFlight) {
            const ts = now();
            if (typeof onSkip === "function" && ts - lastSkipLogTs >= skipLogIntervalMs) {
                lastSkipLogTs = ts;
                onSkip();
            }
            return false;
        }

        inFlight = true;
        try {
            await run();
            return true;
        } catch (err) {
            if (typeof onError === "function") {
                onError(err);
                return false;
            }
            throw err;
        } finally {
            inFlight = false;
        }
    };
}

module.exports = {createNonOverlappingRunner};
