// -----------------------------------------------------------------------------
//
// File: src/controllers/titlesController.js
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

const {loadTitles, saveTitles} = require("../utils/titles");

let titles = loadTitles();

exports.getAll = (req, res) => {
    res.json(Object.entries(titles).map(([alias, {id, notes}]) => ({alias, id, notes})));
};

exports.create = (req, res) => {
    const {alias, id, notes = ""} = req.body;
    if (!alias || !id) return res.status(400).json({error: "alias and id required."});
    if (!/^[\w-]+$/.test(alias)) return res.status(400).json({error: "Unknown alias."});
    if (!/^[A-Za-z0-9]+$/.test(id)) return res.status(400).json({error: "Invalid title id."});
    titles = Object.fromEntries([...Object.entries(titles).filter(([key]) => key !== alias), [alias, {id, notes}]]);
    saveTitles(titles);
    res.status(201).json({alias, id, notes});
};

exports.remove = (req, res) => {
    const alias = req.params.alias;
    if (!Object.hasOwn(titles, alias)) return res.status(404).json({error: "Alias not found."});
    titles = Object.fromEntries(Object.entries(titles).filter(([key]) => key !== alias));
    saveTitles(titles);
    res.json({deleted: alias});
};
