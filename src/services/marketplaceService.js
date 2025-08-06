// src/services/marketplaceService.js

const {
    sendPlayFabRequest,
    fetchAllMarketplaceItemsEfficiently,
    isValidItem,
    transformItem
} = require("../utils/playfab");
const { resolveTitle, loadTitles } = require("../utils/titles");
const { loadCreators, resolveCreatorId } = require("../utils/creators");
const { buildFilter } = require("../utils/filter");

const OS = process.env.OS;

module.exports = {
    /**
     * Holt alle Marketplace-Items für einen einzelnen Alias, mit optionalem Filter via query.tag.
     */
    async fetchAll(alias, query) {
        const titleId = resolveTitle(alias);
        const extra = query.tag
            ? `Tags/any(t:t eq '${query.tag.replace(/'/g, "''")}')`
            : "";
        const filter = buildFilter({ query }, loadCreators(), extra);
        return fetchAllMarketplaceItemsEfficiently(titleId, filter, OS);
    },

    /**
     * Holt die neuesten N Items für einen Alias, optional gefiltert via query.creatorName.
     */
    async fetchLatest(alias, count, query) {
        const titleId = resolveTitle(alias);
        const filter = buildFilter({ query }, loadCreators());
        const payload = {
            ...(filter && { Filter: filter }),
            Search: "",
            Top: count,
            Skip: 0,
            OrderBy: "creationDate desc"
        };
        const data = await sendPlayFabRequest(
            titleId,
            "Catalog/Search",
            payload,
            "X-EntityToken",
            3,
            OS
        );
        return (data.Items || []).filter(isValidItem).map(transformItem);
    },

    /**
     * Sucht nach keyword vom creatorName unter einem Alias.
     */
    async search(alias, creatorName, keyword) {
        const titleId = resolveTitle(alias);
        const cid = resolveCreatorId(loadCreators(), creatorName);
        const filter = `creatorId eq '${cid.replace(/'/g, "''")}'`;
        const data = await sendPlayFabRequest(
            titleId,
            "Catalog/Search",
            { Filter: filter, Search: `"${keyword}"`, Top: 100, Skip: 0, OrderBy: "creationDate desc" },
            "X-EntityToken",
            3,
            OS
        );
        return (data.Items || []).filter(isValidItem).map(transformItem);
    },

    /**
     * Holt die populärsten Items (nach Bewertung) für einen Alias.
     */
    async fetchPopular(alias) {
        const titleId = resolveTitle(alias);
        const filter = buildFilter({ query: {} }, loadCreators());
        const data = await sendPlayFabRequest(
            titleId,
            "Catalog/Search",
            { ...(filter && { Filter: filter }), Search: "", Top: 300, Skip: 0, OrderBy: "rating/totalcount desc" },
            "X-EntityToken",
            3,
            OS
        );
        const arr = (data.Items || []).filter(isValidItem).map(transformItem);
        return arr.length ? arr : [];
    },

    /**
     * Holt Items mit einem bestimmten Tag für einen Alias.
     */
    async fetchByTag(alias, tag) {
        const titleId = resolveTitle(alias);
        const filter = buildFilter({ query: {} }, loadCreators(),
            `Tags/any(t:t eq '${tag.replace(/'/g, "''")}')`
        );
        const data = await sendPlayFabRequest(
            titleId,
            "Catalog/Search",
            { Filter: filter, Search: "", Top: 300, Skip: 0, OrderBy: "creationDate desc" },
            "X-EntityToken",
            3,
            OS
        );
        return (data.Items || []).filter(isValidItem).map(transformItem);
    },

    /**
     * Holt alle kostenlosen Items für einen Alias.
     */
    async fetchFree(alias) {
        const titleId = resolveTitle(alias);
        const data = await sendPlayFabRequest(
            titleId,
            "Catalog/Search",
            { Filter: "displayProperties/price eq 0", Top: 300, Skip: 0 },
            "X-EntityToken",
            3,
            OS
        );
        return (data.Items || []).filter(isValidItem).map(transformItem);
    },

    /**
     * Holt die Details eines einzelnen Items via ID unter einem Alias.
     */
    async fetchDetails(alias, itemId) {
        const titleId = resolveTitle(alias);
        const data = await sendPlayFabRequest(
            titleId,
            "Catalog/Search",
            { Filter: `id eq '${itemId}'`, Top: 1, Skip: 0, OrderBy: "creationDate desc" },
            "X-EntityToken",
            3,
            OS
        );
        const it = (data.Items || []).find(isValidItem);
        if (!it) throw Object.assign(new Error("Item nicht gefunden."), { status: 404 });
        return transformItem(it);
    },

    /**
     * Holt eine Liste vorgeladener Featured-Server aus data/featuredServers.json.
     */
    async fetchFeaturedServers() {
        const featured = require("../config/featuredServers");
        const titleId = resolveTitle("prod");
        const results = [];

        for (const srv of featured) {
            const data = await sendPlayFabRequest(
                titleId,
                "Catalog/Search",
                {
                    Filter: `id eq '${srv.id}'`,
                    Top: 1,
                    Skip: 0,
                    OrderBy: "creationDate desc",
                    Select: "images",
                    Expand: "images"
                },
                "X-EntityToken",
                3,
                OS
            );
            const item = (data.Items || []).find(isValidItem) || null;
            const images = item ? item.Images : [];
            results.push({
                name: srv.name,
                id: srv.id,
                data: item,
                images,
                screenshots: images.filter(i => i.Tag.toLowerCase() !== "thumbnail")
            });
        }

        return results;
    },

    /**
     * Gibt eine kurze Zusammenfassung aller Items für einen Alias zurück.
     */
    async fetchSummary(alias) {
        const all = await this.fetchAll(alias, {});
        return all.map(i => ({
            id: i.Id,
            title: i.Title?.NEUTRAL || i.Title?.neutral || "",
            detailsUrl: `https://view-marketplace.net/details/${i.Id}`,
            clientUrl:  `https://open.view-marketplace.net/StoreOffer/${i.Id}`
        }));
    },

    /**
     * Vergleicht **über alle Titel** nur die Items eines einzelnen Creators.
     * Liefert zurück: { alias1: [items], alias2: [items], … }
     */
    async fetchCompare(creatorName) {
        const titlesMap = loadTitles();               // { alias: { id, notes }, … }
        const creators = loadCreators();
        const cid      = resolveCreatorId(creators, creatorName);

        const result = {};
        // parallel alle Aliases abarbeiten
        await Promise.all(
            Object.entries(titlesMap).map(async ([alias, { id: titleId }]) => {
                // Filter-String für diesen Creator
                const filter = `creatorId eq '${cid.replace(/'/g, "''")}'`;
                const data = await sendPlayFabRequest(
                    titleId,
                    "Catalog/Search",
                    { Filter: filter, Top: 10000, Skip: 0, OrderBy: "creationDate desc" },
                    "X-EntityToken",
                    3,
                    OS
                );
                const items = (data.Items || [])
                    .filter(isValidItem)
                    .map(transformItem);
                result[alias] = items;
            })
        );

        return result;
    },

    /**
     * Holt ein Item über seinen FriendlyId unter einem Alias.
     */
    async fetchByFriendly(alias, friendlyId) {
        const titleId = resolveTitle(alias);
        const filter = `AlternateIds/any(a:a/Type eq 'FriendlyId' and a/Value eq '${friendlyId.replace(/'/g, "''")}')`;
        const data = await sendPlayFabRequest(
            titleId,
            "Catalog/Search",
            { Filter: filter, Count: 1 },
            "X-EntityToken",
            3,
            OS
        );
        const item = (data.Items || []).find(isValidItem);
        if (!item) throw Object.assign(new Error(`Keine Item mit FriendlyId ${friendlyId}`), { status: 404 });
        return transformItem(item);
    }
};
