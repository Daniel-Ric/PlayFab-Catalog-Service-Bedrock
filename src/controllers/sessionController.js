// -----------------------------------------------------------------------------
//
// File: src/controllers/sessionController.js
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

const {resolveTitle} = require("../utils/titles");
const {getSession} = require("../utils/playfab");

function projectSessionStatus(session = {}) {
    const numericExpiry = Number(session.expiresAt);
    const expiresAt = session.TokenExpiration
        || (Number.isFinite(numericExpiry) && numericExpiry > 0 ? new Date(numericExpiry).toISOString() : null);
    return {
        authenticated: Boolean(session.SessionTicket && session.EntityToken),
        playFabId: session.PlayFabId || null,
        expiresAt
    };
}

exports.getSession = async (req, res, next) => {
    try {
        const titleId = resolveTitle(req.params.alias);
        const session = await getSession(titleId, process.env.OS);
        res.setHeader("Cache-Control", "private, no-store");
        res.json(projectSessionStatus(session));
    } catch (err) {
        next(err);
    }
};

exports._internals = {projectSessionStatus};
