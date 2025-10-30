function pick(v, ...rest) {
    return v !== undefined && v !== null && v !== "" ? v : rest.length ? pick(rest[0], ...rest.slice(1)) : null;
}

function pickLocale(obj) {
    if (!obj || typeof obj !== "object") return null;
    return obj["en-US"] || obj["en-GB"] || obj["NEUTRAL"] || Object.values(obj)[0] || null;
}

function getThumbnailUrl(item) {
    const imgs = Array.isArray(item?.Images) ? item.Images : [];
    const thumb = imgs.find(img => {
        const t = (img.Type || img.Tag || "").toLowerCase();
        return t === "thumbnail";
    });
    return thumb ? thumb.Url || null : imgs[0]?.Url || null;
}

function getHeroUrl(item) {
    const imgs = Array.isArray(item?.Images) ? item.Images : [];
    const hero = imgs.find(img => {
        const t = (img.Type || img.Tag || "").toLowerCase();
        const g = (img.Group || "").toLowerCase();
        return t === "screenshot" || g === "screenshots" || t === "hero";
    });
    return hero ? hero.Url || null : getThumbnailUrl(item);
}

function getAllImageUrls(item) {
    const imgs = Array.isArray(item?.Images) ? item.Images : [];
    return imgs.map(i => i?.Url).filter(Boolean);
}

function getPrice(item) {
    const p0 = item?.Price?.Prices?.[0];
    const a0 = p0?.Amounts?.[0];
    return typeof a0?.Amount === "number" ? a0.Amount : null;
}

function getRating(item) {
    const r = item?.Rating || {};
    const average = pick(r.Average, null);
    const count = pick(r.TotalCount, r.Count, null);
    return {average, count};
}

function getLanguagesCount(item) {
    if (item?.Title && typeof item.Title === "object") return Object.keys(item.Title).length;
    return null;
}

function getPackIdentity(item) {
    const dp = item?.DisplayProperties || {};
    const pi = Array.isArray(dp.packIdentity) ? dp.packIdentity[0] : dp.packIdentity || null;
    if (!pi) return null;
    const uuid = pi.uuid || pi.id || null;
    const version = pi.version || null;
    if (!uuid && !version) return null;
    return {uuid, version};
}

function getFriendlyId(item) {
    if (item?.FriendlyId) return item.FriendlyId;
    const alt = Array.isArray(item?.AlternateIds) ? item.AlternateIds : [];
    const fr = alt.find(a => (a.Type || a.type) === "FriendlyId");
    return fr ? fr.Value || fr.value || null : null;
}

function normalizeDate(v) {
    return v ? new Date(v).toISOString() : null;
}

function projectCatalogItem(item) {
    return {
        id: item?.Id || null,
        friendlyId: getFriendlyId(item),
        type: item?.Type || null,
        title: pickLocale(item?.Title),
        description: pickLocale(item?.Description),
        creatorName: item?.DisplayProperties?.creatorName || null,
        price: getPrice(item),
        createdAt: normalizeDate(item?.CreationDate),
        lastModifiedAt: normalizeDate(item?.LastModifiedDate),
        startDate: normalizeDate(item?.StartDate),
        thumbnail: getThumbnailUrl(item),
        hero: getHeroUrl(item),
        images: getAllImageUrls(item),
        rating: getRating(item),
        tags: Array.isArray(item?.Tags) ? item.Tags : [],
        platforms: Array.isArray(item?.Platforms) ? item.Platforms : [],
        languages: getLanguagesCount(item),
        packIdentity: getPackIdentity(item),
        etag: item?.ETag || null,
        rawItem: item || null
    };
}

function projectCatalogItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(projectCatalogItem);
}

module.exports = {
    projectCatalogItem, projectCatalogItems
};
