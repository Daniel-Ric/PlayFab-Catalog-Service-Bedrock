function pickLocale(obj) {
    if (!obj || typeof obj !== "object") return null;
    return (obj["en-US"] || obj["en-GB"] || obj["NEUTRAL"] || Object.values(obj)[0] || null);
}

function getThumbnailUrl(item) {
    if (!item || !Array.isArray(item.Images)) return null;
    const thumb = item.Images.find(img => (img.Type && img.Type.toLowerCase() === "thumbnail") || (img.Tag && img.Tag.toLowerCase() === "thumbnail"));
    return thumb ? thumb.Url : null;
}

function getPrice(item) {
    if (!item || !item.Price || !Array.isArray(item.Price.Prices)) return null;
    const firstPriceEntry = item.Price.Prices[0];
    if (!firstPriceEntry || !Array.isArray(firstPriceEntry.Amounts)) return null;
    const firstAmount = firstPriceEntry.Amounts[0];
    if (!firstAmount || typeof firstAmount.Amount !== "number") return null;
    return firstAmount.Amount;
}

function projectCatalogItem(item) {
    return {
        id: item.Id || null,
        friendlyId: item.FriendlyId || null,
        type: item.Type || null,
        title: pickLocale(item.Title),
        description: pickLocale(item.Description),
        creatorName: item.DisplayProperties && item.DisplayProperties.creatorName ? item.DisplayProperties.creatorName : null,
        price: getPrice(item),
        createdAt: item.CreationDate || null,
        lastModifiedAt: item.LastModifiedDate || null,
        startDate: item.StartDate || null,
        thumbnail: getThumbnailUrl(item)
    };
}

function projectCatalogItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(projectCatalogItem);
}

module.exports = {
    projectCatalogItem, projectCatalogItems
};
