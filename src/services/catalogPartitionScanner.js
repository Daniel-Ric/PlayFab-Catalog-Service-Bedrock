"use strict";


const iso = value => new Date(value).toISOString();
function createScan({now = Date.now(), since = null} = {}) {
    const horizon = iso(now);
    const ranges = [];
    let from = since;
    if (!since) {
        for (let year = 2010; year <= new Date(now).getUTCFullYear(); year++) {
            const to = `${year}-01-01T00:00:00.000Z`;
            if (Date.parse(to) >= now) break;
            ranges.push({from, to, token: null, pages: 0, seen: []});
            from = to;
        }
    }
    ranges.push({from, to: horizon, token: null, pages: 0, seen: []});
    return {
        version: 1, id: require("node:crypto").randomUUID(), horizon, since,
        field: since ? "LastModifiedDate" : "CreationDate", pages: 0, sequence: 0,
        completed: 0, status: "partial", error: null,
        pending: [...ranges,
            ...(since ? ['CreationDate', 'StartDate'].map(field => ({field,
                from: iso(Math.min(Date.parse(since), now - 86400000)), to: horizon,
                token: null, pages: 0, seen: []})) : []),
            ...(since ? [] : [{nullDate: true, token: null, pages: 0, seen: []}])]
    };
}

function partitionFilter(scan, partition) {
    const field = partition.field || scan.field;
    const quote = value => String(value).replace(/'/g, "''");
    const dates = partition.nullDate ? [`${field} eq null`]
        : [partition.from && `${field} ge ${partition.from}`, `${field} lt ${partition.to}`];
    return [...dates, partition.idFrom && `Id ge '${quote(partition.idFrom)}'`, partition.idTo && `Id lt '${quote(partition.idTo)}'`]
        .filter(Boolean).join(" and ");
}

function splitById(partition) {
    const ids = [...new Set(partition.sampleIds || [])].sort();
    if (ids.length < 2) return null;
    const pivot = ids[Math.floor(ids.length / 2)];
    if (pivot === partition.idFrom || pivot === partition.idTo) return null;
    const base = {field: partition.field, from: partition.from, to: partition.to, nullDate: partition.nullDate,
        idFrom: partition.idFrom, idTo: partition.idTo, idPartition: true, token: null, pages: 0, seen: []};
    return [{...base, idTo: pivot}, {...base, idFrom: pivot}];
}

function splitPartition(partition) {


    if (partition.idPartition || !partition.differentDates) {
        const children = splitById(partition);
        if (children) return children;
        if (partition.idPartition) return null;
    }
    if (partition.nullDate) return null;
    const lower = partition.from ? Date.parse(partition.from) : Date.parse("0001-01-01T00:00:00.000Z");
    const upper = Date.parse(partition.to);
    if (!Number.isFinite(lower) || upper - lower <= 1) return null;
    const middle = iso(lower + Math.floor((upper - lower) / 2));
    return [
        {field: partition.field, from: partition.from, to: middle, token: null, pages: 0, seen: []},
        {field: partition.field, from: middle, to: partition.to, token: null, pages: 0, seen: []}
    ];
}

function isSearchWindowError(error) {
    return /skip must be between|search window|maximum.*skip/i.test(`${error?.message || ""} ${error?.publicMessage || ""}`);
}

async function scanCatalog({state, fetchPage, commit, maxPages = Infinity, signal}) {
    let read = 0;
    state.error = null;
    state.status = "partial";
    while (state.pending.length && read < maxPages) {
        if (signal?.aborted) break;
        const partition = state.pending[0];
        let data;
        try {

            if (partition.pages >= 200) throw new Error("upstream search window");
            data = await fetchPage({Count: 50, Filter: partitionFilter(state, partition),
                OrderBy: partition.idPartition ? 'Id asc' : `${partition.field || state.field} asc`, Select: "title,images,startDate,description,keywords",
                ...(partition.token ? {ContinuationToken: partition.token} : {})});
        } catch (error) {
            if (isSearchWindowError(error)) {
                const children = splitPartition(partition);
                if (children) {
                    state.pending.splice(0, 1, ...children);
                    await commit(state, []);
                    continue;
                }
                state.error = {reason: "unsplittable_partition", filter: partitionFilter(state, partition)};
            } else {
                state.error = {reason: "upstream_error", message: String(error.message).slice(0, 500)};
            }
            await commit(state, []);
            return state;
        }
        const items = data?.Items ?? data?.items;
        if (!Array.isArray(items) || items.some(item => !item || !(item.Id || item.id))) {
            state.error = {reason: "invalid_upstream_page"};
            await commit(state, []);
            return state;
        }
        const token = data.ContinuationToken || data.continuationToken || null;
        partition.sampleIds ||= [];
        for (const item of items) {
            partition.sampleIds.push(String(item.Id || item.id));
            const field = partition.field || state.field;
            const date = item[field] ?? item[field[0].toLowerCase() + field.slice(1)] ?? null;
            if (!Object.hasOwn(partition, 'firstDate')) partition.firstDate = date;
            else if (partition.firstDate !== date) partition.differentDates = true;
        }
        state.pages++; read++; partition.pages++;
        if (token && (token === partition.token || partition.seen.includes(token))) {
            state.error = {reason: "cursor_repeated", filter: partitionFilter(state, partition)};

            await commit(state, items);
            return state;
        }
        if (token) {
            partition.seen.push(token);
            partition.token = token;
        } else {
            state.pending.shift();
            state.completed++;
        }
        await commit(state, items);
    }
    if (!state.pending.length) {
        state.status = "complete";
        await commit(state, []);
    }
    return state;
}

module.exports = {createScan, partitionFilter, splitPartition, splitById, scanCatalog, isSearchWindowError};
