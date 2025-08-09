const { loadTitles, saveTitles, resolveTitle } = require("../utils/titles");

let titles = loadTitles();

exports.getAll = (req, res) => {
    res.json(Object.entries(titles).map(([alias, { id, notes }]) => ({ alias, id, notes })));
};

exports.create = (req, res) => {
    const { alias, id, notes = "" } = req.body;
    if (!alias || !id) return res.status(400).json({ error: "alias and id required." });
    if (!/^[\w-]+$/.test(alias)) return res.status(400).json({ error: "Unknown alias." });
    titles[alias] = { id, notes };
    saveTitles(titles);
    res.status(201).json({ alias, id, notes });
};

exports.remove = (req, res) => {
    const alias = req.params.alias;
    if (!titles[alias]) return res.status(404).json({ error: "Alias not found." });
    delete titles[alias];
    saveTitles(titles);
    res.json({ deleted: alias });
};
