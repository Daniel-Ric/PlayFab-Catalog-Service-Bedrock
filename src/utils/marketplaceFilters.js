const {resolveCreatorId} = require("./creators");

function andFilter(a, b) {
    const A = (a || "").trim();
    const B = (b || "").trim();
    if (A && B) return `(${A}) and (${B})`;
    return A || B || "";
}

function buildPlayerMarketplaceFilter(filter, creatorName, creators = []) {
    const base = (filter || "").trim();
    const name = String(creatorName || "").trim();
    if (!name) return base;
    const cid = resolveCreatorId(creators, name);
    const creatorFilter = `creatorId eq '${cid.replace(/'/g, "''")}'`;
    return andFilter(base, creatorFilter);
}

module.exports = {buildPlayerMarketplaceFilter};
