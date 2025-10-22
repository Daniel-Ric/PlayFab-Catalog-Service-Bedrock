const NodeCache = require("node-cache");

const sessionCache = new NodeCache({
    stdTTL: (process.env.SESSION_TTL_MS || 30 * 60 * 1000) / 1000,
    checkperiod: 60,
    useClones: false
});

const dataCache = new NodeCache({
    stdTTL: 5 * 60,
    checkperiod: 120,
    useClones: false
});

module.exports = {sessionCache, dataCache};
