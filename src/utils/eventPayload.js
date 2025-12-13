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
                if (before && before.creatorName) names.add(String(before.creatorName).toLowerCase());
                if (after && after.creatorName) names.add(String(after.creatorName).toLowerCase());
                if (it.creatorName) names.add(String(it.creatorName).toLowerCase());
            }
        } else if (ev === "item.created" || ev === "item.snapshot") {
            for (const it of payload.items) {
                if (it && it.creatorName) names.add(String(it.creatorName).toLowerCase());
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
