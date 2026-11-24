"use strict";

// PlayFab rejects an entire GetItems batch when just one referenced item is gone.
// Only suppress explicit, identified missing-item errors; all other failures propagate.
async function fetchAvailableCatalogItems(ids, request) {
    let remaining = [...new Set(ids)];
    while (remaining.length) {
        try { return await request(remaining); }
        catch (error) {
            const status = Number(error.status || error.response?.status);
            const message = error.response?.data?.errorMessage || error.publicMessage || error.message || "";
            if (status !== 400 || !/Unable to find one or more items:/i.test(message)) throw error;
            const reported = new Set([...message.matchAll(/'([^']+)'/g)].map(match => match[1]));
            const next = remaining.filter(id => !reported.has(id));
            if (next.length === remaining.length) throw error;
            remaining = next;
        }
    }
    return {Items: []};
}
module.exports = {fetchAvailableCatalogItems};
