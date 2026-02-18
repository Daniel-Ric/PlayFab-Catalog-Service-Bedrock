// -----------------------------------------------------------------------------
//
// File: src/utils/eventPayload.js
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

function creatorNameOf(item) {
    if (!item || typeof item !== "object") return null;
    return item.creatorName || item.creator || item.DisplayProperties?.creatorName || null;
}

function getCreatorNamesFromPayload(eventName, payload) {
    if (!payload) return [];
    const names = new Set();
    const ev = String(eventName || "");

    if (Array.isArray(payload.items)) {
        if (ev === "item.updated") {
            for (const it of payload.items) {
                if (!it) continue;
                const before = it.before || it.previous || null;
                const after = it.after || it.current || null;

                const beforeCreator = creatorNameOf(before);
                const afterCreator = creatorNameOf(after);
                const directCreator = creatorNameOf(it);

                if (beforeCreator) names.add(String(beforeCreator).toLowerCase());
                if (afterCreator) names.add(String(afterCreator).toLowerCase());
                if (directCreator) names.add(String(directCreator).toLowerCase());
            }
        } else if (ev === "item.created" || ev === "item.snapshot") {
            for (const it of payload.items) {
                const creator = creatorNameOf(it);
                if (creator) names.add(String(creator).toLowerCase());
            }
        }
    }

    if (ev === "creator.trending" && Array.isArray(payload.leaders)) {
        for (const leader of payload.leaders) {
            if (leader && leader.creator) names.add(String(leader.creator).toLowerCase());
        }
    }

    return Array.from(names);
}

module.exports = {getCreatorNamesFromPayload};
