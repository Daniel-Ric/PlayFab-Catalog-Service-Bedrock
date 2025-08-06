const { resolveTitle } = require("../utils/titles");
const { getSession }   = require("../utils/playfab");

exports.getSession = async (req, res, next) => {
    try {
        // Alias in die Title-ID auflösen
        const titleId = resolveTitle(req.params.alias);
        // Session holen (SessionTicket, PlayFabId, EntityToken)
        const session = await getSession(titleId, process.env.OS);
        // das vollständige Session-Objekt zurückgeben
        res.json(session);
    } catch (err) {
        next(err);
    }
};
