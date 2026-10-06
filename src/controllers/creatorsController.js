// -----------------------------------------------------------------------------
//
// File: src/controllers/creatorsController.js
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

const withETag = require("../middleware/etag");
const withPagination = require("../middleware/pagination");
const { loadCreators } = require("../utils/creators");
const { enrichCreatorImages } = require("../services/creatorRegistryService");

const creators = loadCreators();

exports.getAll = withETag(withPagination(async () => {
    const enriched = await enrichCreatorImages(creators, undefined, 2000);
    return enriched.map(c => ({ creatorName: c.creatorName, displayName: c.displayName, imageUrl: c.imageUrl }));
}));
