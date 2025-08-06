const { loadCreators } = require("../utils/creators");

const creators = loadCreators();

exports.getAll = (req, res) => {
    res.json(creators.map(c => ({ creatorName: c.creatorName, displayName: c.displayName })));
};
