'use strict';

// Offsets refer to visible catalog records, not discarded navigation manifests.
async function visibleCatalogPage(params, load, valid, transform) {
    const required = params.skip + params.limit + 1;
    const visible = [];
    let rawSkip = 0;
    let rawTotal = null;
    let more = true;
    while (more && visible.length < required) {
        if (rawSkip > 10000) {
            const error = new Error('Visible page exceeds the legacy search window');
            error.code = 'CATALOG_VISIBLE_CURSOR_REQUIRED';
            throw error;
        }
        const top = Math.min(300, Math.max(50, required - visible.length));
        const page = await load(rawSkip, top);
        const raw = page.items;
        if (page.total !== null) rawTotal = page.total;
        for (const item of raw) if (valid(item)) visible.push(transform(item));
        rawSkip += raw.length;
        more = raw.length === top && (rawTotal === null || rawSkip < rawTotal);
    }
    return {params, items: visible.slice(params.skip, params.skip + params.limit),
        total: visible.length + (more ? 1 : 0), rawTotal};
}
module.exports = {visibleCatalogPage};
