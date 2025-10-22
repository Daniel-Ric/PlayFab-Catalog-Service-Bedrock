const {resolveTitle} = require("../utils/titles");
const {getSession} = require("../utils/playfab");

exports.getSession = async (req, res, next) => {
    try {
        const titleId = resolveTitle(req.params.alias);
        const session = await getSession(titleId, process.env.OS);
        res.json(session);
    } catch (err) {
        next(err);
    }
};
