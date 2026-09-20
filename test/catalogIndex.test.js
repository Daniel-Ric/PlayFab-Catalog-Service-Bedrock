const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createScan, scanCatalog} = require('../src/services/catalogPartitionScanner');
const {CatalogOfferIndex, projectOffer} = require('../src/services/catalogOfferIndex');
const {CatalogIndexStore} = require('../src/services/catalogIndexStore');

function upstream(rows) {
    const tokens = new Map(); let sequence = 0;
    return async payload => {
        assert.equal(payload.Count, 50);
        const field = payload.Filter.split(' ')[0];
        const lower = payload.Filter.match(/ ge ([^ ]+)/)?.[1];
        const upper = payload.Filter.match(/ lt ([^ ]+)/)?.[1];
        const idLower = payload.Filter.match(/Id ge '([^']+)'/)?.[1];
        const idUpper = payload.Filter.match(/Id lt '([^']+)'/)?.[1];
        const selected = rows.filter(row => (payload.Filter.includes('eq null') ? row[field] == null
            : row[field] != null && (!lower || row[field] >= lower) && row[field] < upper)
            && (!idLower || row.Id >= idLower) && (!idUpper || row.Id < idUpper));
        if (payload.OrderBy === 'Id asc') selected.sort((a, b) => a.Id.localeCompare(b.Id));
        const token = payload.ContinuationToken && tokens.get(payload.ContinuationToken);
        if (payload.ContinuationToken) assert.equal(token.filter, payload.Filter);
        const offset = token?.offset || 0;
        if (offset > 10000) throw new Error('Skip must be between 0 and 10000, inclusively');
        const items = selected.slice(offset, offset + 50);
        let next;
        if (offset + 50 < selected.length) { next = `opaque-${++sequence}`; tokens.set(next, {filter: payload.Filter, offset: offset + 50}); }
        return {Items: items, ContinuationToken: next};
    };
}
const row = (id, extra = {}) => ({Id: String(id), ContentType: 'MarketplaceDurableCatalog_V1.2',
    CreationDate: '2020-02-01T00:00:00.000Z', Tags: ['skinpack'], Title: {NEUTRAL: `Offer ${id}`},
    DisplayProperties: {creatorName: 'Creator', price: 0}, ...extra});

test('partitioned scan crosses 10,050, includes null dates, and resumes with opaque tokens', async () => {
    const rows = Array.from({length: 12050}, (_, i) => row(i, {CreationDate: new Date(Date.UTC(2020, 0, 1) + i * 2000000).toISOString()}));
    rows.push(row('null', {CreationDate: null}));
    const ids = new Set(); const fetchPage = upstream(rows);
    let state = createScan({now: Date.UTC(2021, 0, 1)});
    const commit = async (checkpoint, items) => { items.forEach(item => ids.add(item.Id)); state = JSON.parse(JSON.stringify(checkpoint)); };
    await scanCatalog({state, fetchPage, commit, maxPages: 13});
    assert.equal(state.status, 'partial');
    await scanCatalog({state, fetchPage, commit});
    assert.equal(state.status, 'complete');
    assert.equal(ids.size, rows.length);
});

test('dense timestamps and null partitions fail explicitly instead of claiming completion', async () => {
    for (const partition of [{from: '2020-01-01T00:00:00.000Z', to: '2020-01-01T00:00:00.001Z'}, {nullDate: true}]) {
        const state = createScan(); state.pending = [{...partition, pages: 200, seen: [], token: 'opaque'}];
        await scanCatalog({state, fetchPage: async () => { throw new Error('must not call'); }, commit: async () => {}});
        assert.equal(state.error.reason, 'unsplittable_partition');
        assert.equal(state.status, 'partial');
    }
});

test('live-verified ID intervals complete dense equal timestamps and null-date groups', async () => {
    for (const date of ['0001-01-01T00:00:00Z', null]) {
        const rows = Array.from({length: 11050}, (_, i) => row(String(i).padStart(8, '0'), {CreationDate: date}));
        const state = createScan({now: Date.UTC(2021, 0, 1)}), ids = new Set();
        await scanCatalog({state, fetchPage: upstream(rows), commit: async (_, page) => page.forEach(item => ids.add(item.Id))});
        assert.equal(state.status, 'complete');
        assert.equal(ids.size, rows.length);
        assert.ok(state.completed > 1);
    }
});

test('repeated cursor preserves rows and stays partial', async () => {
    const state = createScan(); let calls = 0, count = 0;
    await scanCatalog({state, fetchPage: async () => ({Items: [row(++calls)], ContinuationToken: 'same'}),
        commit: async (_, rows) => { count += rows.length; }});
    assert.equal(count, 2); assert.equal(state.error.reason, 'cursor_repeated');
});

test('offer scope, primary category and contained packs remain distinct; missing images retained', () => {
    const items = [row('skin'), row('world', {Tags: ['worldtemplate'], DisplayProperties: {packIdentity: [{type: 'skinpack'}]}}),
        row('persona', {ContentType: 'PersonaDurable'}), row('shell', {ContentType: 'shell_MarketplaceDurableCatalog_V1.2'}), row('content', {ContentType: 'skinpack'})].map(raw => projectOffer(raw));
    const index = new CatalogOfferIndex({id: 'snapshot', updatedAt: new Date().toISOString(), items});
    assert.equal(index.query({category: 'skinpack'}).items.length, 1);
    assert.equal(index.query({packType: 'skinpack'}).items[0].Id, 'world');
    assert.deepEqual(index.stats().scopes, {marketplace: 2, persona: 1, raw: 2});
});

test('2500 creator items transfer once, cursors bind query and snapshot', () => {
    const index = new CatalogOfferIndex({id: 'one', updatedAt: new Date().toISOString(), items: Array.from({length: 2500}, (_, i) => projectOffer(row(i)))});
    let cursor, count = 0, requests = 0;
    do { const page = index.query({creator: 'Creator', limit: 1000, cursor}); count += page.items.length; cursor = page.pagination.nextCursor; requests++; } while (cursor);
    assert.equal(count, 2500); assert.equal(requests, 3);
    const first = index.query({limit: 24});
    assert.throws(() => index.query({limit: 24, creator: 'different', cursor: first.pagination.nextCursor}), /match query/);
    index.snapshot.id = 'two';
    assert.throws(() => index.query({limit: 24, cursor: first.pagination.nextCursor}), /snapshot changed/);
});

test('durable restart resumes and failed refresh retains the old complete snapshot', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-index-test-'));
    try {
        const fetchPage = upstream([row('one'), row('two')]);
        const store = new CatalogIndexStore({directory, fetchPage, now: () => Date.UTC(2021, 0, 1)});
        await store.sync({maxPages: 5});
        const resumed = new CatalogIndexStore({directory, fetchPage, now: () => Date.UTC(2021, 0, 1)});
        await resumed.sync();
        assert.equal(resumed.index.query().items.length, 2);
        const failing = new CatalogIndexStore({directory, fetchPage: async () => { throw new Error('offline'); }, now: () => Date.UTC(2021, 0, 3)});
        await failing.sync();
        assert.equal(failing.coverage().status, 'stale');
        assert.equal(failing.index.query().items.length, 2);
        assert.equal(failing.coverage().sync.lastError.reason, 'upstream_error');
    } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});

test('home is bounded and limits one creator per block', () => {
    const index = new CatalogOfferIndex({id: 'home', updatedAt: new Date().toISOString(), items: Array.from({length: 300}, (_, i) => projectOffer(row(i)))});
    for (const block of Object.values(index.home().blocks)) assert.ok(block.length <= 3);
});

test('read replicas refresh import progress before the first snapshot is published', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-reader-test-'));
    try {
        const writer = new CatalogIndexStore({directory, fetchPage: upstream([row('one')])});
        const reader = new CatalogIndexStore({directory, fetchPage: async () => { throw new Error('read only'); }});
        await writer.sync({maxPages: 2});
        reader.refreshReader();
        assert.equal(reader.coverage().sync.pages, 2);
        assert.equal(reader.coverage().status, 'partial');
    } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});

test('sorts neutral title variants consistently and keeps unknown prices last', () => {
    const items = [row('z', {Title: {neutral: 'Zulu'}, DisplayProperties: {creatorName: 'Creator', price: 10}}),
        row('a', {Title: {NEUTRAL: 'Alpha'}, DisplayProperties: {creatorName: 'Creator'}})].map(item => projectOffer(item));
    const index = new CatalogOfferIndex({id: 'sort', updatedAt: new Date().toISOString(), items});
    assert.equal(index.query({sort: 'title'}).items[0].Id, 'a');
    assert.equal(index.query({sort: 'price', dir: 'desc'}).items[0].Id, 'z');
});

test('creator names never expand through shared upload accounts, including existing snapshots', () => {
    const items = [
        {...projectOffer(row('hive')), creatorId: 'shared', creatorAliases: ['The Hive', 'TheHive'], DisplayProperties: {creatorName: 'The Hive'}},
        {...projectOffer(row('minecraft')), creatorId: 'shared', creatorAliases: ['Minecraft'], DisplayProperties: {creatorName: 'Minecraft'}},
        {...projectOffer(row('hive-server', {ContentType: '3PServerContentDurable'})), creatorId: 'hive-account', creatorAliases: ['The Hive'], DisplayProperties: {creatorName: 'The Hive'}}
    ];
    const index = new CatalogOfferIndex({id: 'existing', updatedAt: new Date().toISOString(), items});
    assert.deepEqual(index.query({creator: 'TheHive', scope: 'offers'}).items.map(i => i.Id).sort(), ['hive', 'hive-server']);
    assert.deepEqual(index.query({creatorId: 'shared', creator: 'The Hive'}).items.map(i => i.Id), ['hive']);
    assert.equal(index.query({creatorId: 'shared'}).items.length, 2);
    assert.equal(index.query({creator: 'unknown'}).meta.total, 0);
});

test('incremental scans discover releases with old modification dates and retain pending full scans', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-freshness-test-'));
    let now = Date.UTC(2026, 8, 19);
    const rows = [row('old'), row('other')];
    try {
        const store = new CatalogIndexStore({directory, now: () => now, fetchPage: upstream(rows)});
        await store.sync();
        const first = store.query({limit: 1});
        const firstId = first.coverage.snapshotId;
        now += 60000;
        await store.sync({maxPages: 12});
        const fullId = store.state.id;
        now += 1000;
        rows[0] = row('old', {Title: {NEUTRAL: 'Updated'}, LastModifiedDate: new Date(now - 1).toISOString()});
        rows.push(row('released', {StartDate: new Date(now - 1000).toISOString(), LastModifiedDate: '2020-01-01T00:00:00.000Z'}));
        rows.push(row('created', {CreationDate: new Date(now - 1).toISOString()}));
        await store.sync({incremental: true});
        assert.ok(store.index.query().items.some(i => i.Id === 'released'));
        assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'checkpoint.json'))).id, fullId);
        assert.equal(fs.existsSync(path.join(directory, fullId)), true);
        const reader = new CatalogIndexStore({directory, now: () => now, fetchPage: upstream(rows)});
        const next = reader.query({limit: 1, cursor: first.pagination.nextCursor});
        assert.equal(next.coverage.snapshotId, firstId);
        assert.equal(next.items.length, 1);
        assert.notEqual(next.items[0].Id, first.items[0].Id);
        now += 1000;
        await store.sync();
        assert.ok(store.index.query().items.some(i => i.Id === 'released'));
        assert.ok(store.index.query().items.some(i => i.Id === 'created'));
        assert.equal(store.index.query().items.find(i => i.Id === 'old').Title.NEUTRAL, 'Updated');
        now += 121000;
        assert.throws(() => store.query({limit: 1, cursor: first.pagination.nextCursor}), /snapshot changed/);
    } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});

test('incremental creation and release partitions preserve their field when split', () => {
    const {splitPartition, partitionFilter} = require('../src/services/catalogPartitionScanner');
    const scan = createScan({now: Date.UTC(2026, 8, 20), since: '2026-09-19T23:45:00.000Z'});
    assert.deepEqual(scan.pending.map(p => p.field || scan.field), ['LastModifiedDate', 'CreationDate', 'StartDate']);
    for (const field of ['StartDate', 'CreationDate']) {
        const partition = scan.pending.find(p => p.field === field);
        const children = splitPartition({...partition, differentDates: true});
        for (const child of children) assert.match(partitionFilter(scan, child), new RegExp(`^${field} ge`));
    }
});
