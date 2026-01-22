function asCleanString(value) {
    if (typeof value !== "string") return "";
    return value.trim();
}

function resolveMarketplaceEntityInput(payload = {}) {
    const entityToken = asCleanString(payload.entityToken);
    const titleEntityToken = asCleanString(payload.titleEntityToken);
    const masterEntityToken = asCleanString(payload.masterEntityToken);
    const titlePlayerAccountId = asCleanString(payload.titlePlayerAccountId);

    if (entityToken && titleEntityToken && entityToken !== titleEntityToken) {
        const err = new Error("Entity tokens do not match.");
        err.status = 400;
        throw err;
    }

    const effectiveEntityToken = entityToken || titleEntityToken;
    if (effectiveEntityToken) {
        return {
            entityToken: effectiveEntityToken,
            masterEntityToken: "",
            titlePlayerAccountId: ""
        };
    }

    if (masterEntityToken && titlePlayerAccountId) {
        return {entityToken: "", masterEntityToken, titlePlayerAccountId};
    }

    const err = new Error("Entity token is required.");
    err.status = 400;
    throw err;
}

module.exports = {resolveMarketplaceEntityInput};
