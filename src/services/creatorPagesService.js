// -----------------------------------------------------------------------------
//
// File: src/services/creatorPagesService.js
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

const playfab = require("../utils/playfab");
const titles = require("../utils/titles");
const creators = require("../utils/creators");

const CREATOR_PAGE_CONTENT_TYPE = "CreatorPageManifest_V1.0.0";

async function fetchCreatorPages(alias, query = {}) {
    const titleId = titles.resolveTitle(alias);
    let filter = `ContentType eq '${CREATOR_PAGE_CONTENT_TYPE}'`;
    if (query.creatorName) {
        const id = creators.resolveCreatorId(creators.loadCreators(), query.creatorName);
        filter += ` and creatorId eq '${String(id).replace(/'/g, "''")}'`;
    }
    const os = process.env.OS || "iOS";
    const pages = new Map();
    const seenTokens = new Set();
    let continuationToken = "";

    do {
        const payload = {Filter: filter, Count: 50, OrderBy: "startDate desc"};
        if (continuationToken) payload.ContinuationToken = continuationToken;
        const data = await playfab.sendPlayFabRequest(titleId, "Catalog/SearchItems", payload, "X-EntityToken", 3, os);
        const hits = data?.Items || data?.items;
        if (!Array.isArray(hits)) {
            const error = new Error("Creator pages response is missing Items.");
            error.status = 502;
            throw error;
        }
        const ids = [...new Set(hits.map(hit => {
            const item = hit?.Item || hit?.item || hit;
            return hit?.Id || hit?.id || item?.Id || item?.id || hit?.ItemId || hit?.itemId;
        }))];
        const items = await playfab.getItemsByIds(titleId, ids, os, 50, 1);
        const byId = new Map(items.map(item => [item.Id || item.id, item]));
        for (const id of ids) {
            const item = byId.get(id);
            if (!id || !item) {
                const error = new Error(`Creator page '${id || "unknown"}' is missing from the catalog detail response.`);
                error.status = 502;
                throw error;
            }
            if (item.ContentType === CREATOR_PAGE_CONTENT_TYPE) pages.set(id, playfab.transformItem(item));
        }
        continuationToken = data.ContinuationToken || data.continuationToken || "";
        if (continuationToken && seenTokens.has(continuationToken)) {
            const error = new Error("Creator pages returned a repeated continuation token.");
            error.status = 502;
            throw error;
        }
        if (continuationToken) seenTokens.add(continuationToken);
    } while (continuationToken);

    return [...pages.values()];
}

module.exports = {fetchCreatorPages};
