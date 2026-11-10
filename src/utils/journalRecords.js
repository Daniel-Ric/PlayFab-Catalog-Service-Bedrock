// -----------------------------------------------------------------------------
//
// File: src/utils/journalRecords.js
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

function mergeJournalRecords(snapshot, appended) {
    const boundary = snapshot.length ? appended.findIndex(record => record.id === snapshot.at(-1).id) : -1;
    const records = snapshot.slice();
    const seen = new Set(records.map(record => record.id));
    for (let i = boundary + 1; i < appended.length; i++) {
        const record = appended[i];
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        records.push(record);
    }
    return records;
}

module.exports = {mergeJournalRecords};
