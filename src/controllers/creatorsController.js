const withETag = require("../middleware/etag");
const withPagination = require("../middleware/pagination");
const {loadCreators} = require("../utils/creators");

const creators = loadCreators();

exports.getAll = withETag(withPagination(async (req, res) => {
    return creators.map(c => ({creatorName: c.creatorName, displayName: c.displayName}));
}));
