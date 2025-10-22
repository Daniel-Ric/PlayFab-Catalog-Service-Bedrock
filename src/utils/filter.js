const {resolveCreatorId} = require("./creators");

function buildFilter(req, creators, extra = "") {
    const parts = [];
    if (req.query.creatorName) {
        const cid = resolveCreatorId(creators, req.query.creatorName);
        parts.push(`creatorId eq '${cid.replace(/'/g, "''")}'`);
    }
    if (extra) parts.push(extra);
    return parts.join(" and ");
}

module.exports = {buildFilter};
