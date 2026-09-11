const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {EventEmitter} = require('node:events');
const {EventJournal} = require('../src/services/eventJournal');
const {SseHub} = require('../src/services/sseHub');
const {WatcherCursor} = require('../src/utils/watcherCursor');

function temp(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-reliability-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    return dir;
}
class Response extends EventEmitter {
    constructor() { super(); this.writable = true; this.writableEnded = false; this.frames = []; }
    status() {} setHeader() {} flushHeaders() {} flush() {}
    write(line) { this.frames.push(line); return !this.blocked; }
    destroy() { this.writable = false; this.emit('close'); }
}

test('SSE replays disconnected events after restart with event filters and final checkpoint', t => {
    const file = path.join(temp(t), 'events.json');
    const first = new SseHub({journal: new EventJournal({file})});
    first.broadcast('item.created', {items: [{id: 'a'}]});
    const cursor = first.journal.replay(null).latestId;
    first.broadcast('realms.plus.added', {items: [{id: 'realms'}]});
    first.broadcast('item.updated', {items: [{id: 'update'}]});
    const second = new SseHub({journal: new EventJournal({file})});
    const res = new Response();
    const client = second.addClient(res, {events: new Set(['realms.plus.added'])}, 'bot', cursor);
    t.after(() => second.removeClient(client));
    assert.equal(res.frames.length, 2);
    assert.match(res.frames[0], /realms.plus.added/);
    assert.doesNotMatch(res.frames.join(''), /"id":"update"/);
    assert.match(res.frames.at(-1), /event: ready/);
    assert.ok(res.frames.at(-1).includes(second.journal.replay(null).latestId));
});

test('SSE queues under backpressure and replays only subsequent records', t => {
    const hub = new SseHub({journal: new EventJournal({file: null})});
    const res = new Response(); const client = hub.addClient(res, {});
    t.after(() => hub.removeClient(client));
    res.blocked = true;
    hub.broadcast('item.created', {items: [{id: 'a'}]});
    const cursor = hub.journal.replay(null).latestId;
    hub.broadcast('item.updated', {items: [{id: 'b'}]});
    assert.equal(client.queue.length, 1);
    assert.equal(hub.clients.size, 1);
    res.blocked = false; res.emit('drain');
    assert.equal(client.queue.length, 0);
    assert.equal(hub.journal.replay(cursor).records.length, 1);
});

test('journal persistence failure prevents live acknowledgement and retention gaps are explicit', t => {
    const dir = temp(t);
    const hub = new SseHub({journal: new EventJournal({file: path.join(dir, 'events.json')})});
    const res = new Response(); const client = hub.addClient(res, {});
    t.after(() => hub.removeClient(client));
    hub.journal.file = dir;
    assert.throws(() => hub.broadcast('item.created', {items: []}));
    assert.equal(res.frames.length, 1);
    assert.equal(hub.journal.records.length, 0);
    const journal = new EventJournal({file: null, maxBytes: 1});
    const first = journal.append('item.created', {});
    journal.append('item.updated', {});
    assert.equal(journal.replay(first.id).gap, true);
});

test('replay never stores content credentials, and snapshots do not advance its cursor', () => {
    const hub = new SseHub({journal: new EventJournal({file: null})});
    hub.broadcast('item.created', {items: [{Contents: [{Url: 'https://example.invalid/private', Key: 'secret'}]}]});
    const id = hub.journal.replay(null).latestId;
    hub.broadcast('item.snapshot', {items: []});
    assert.equal(hub.journal.replay(null).latestId, id);
    assert.equal(hub.journal.records[0].data.items[0].Contents[0].Url, null);
});

test('persisted scan cursor catches downtime and schedules a wider reconciliation', t => {
    const file = path.join(temp(t), 'cursor.json');
    const first = new WatcherCursor(file, {}); const now = 1800000000000;
    first.commit(now, first.window(now));
    const resumed = new WatcherCursor(file, {});
    assert.equal(resumed.window(now + 3600000).since, now - 900000);
    assert.ok(resumed.window(now + 7 * 3600000).since <= now - 7 * 86400000);
});

function loadWatcher(file, env, mocks, clock) {
    const filename = path.resolve(__dirname, '../src/services', file);
    const nativeRequire = createRequire(filename); const mod = {exports: {}};
    let tick;
    class Clock extends Date { static now() { return clock(); } }
    const req = name => mocks[name] || nativeRequire(name);
    const extra = file === 'itemWatcher.js' ? '\nmodule.exports.probe = {requestItems};' : '';
    vm.compileFunction(fs.readFileSync(filename, 'utf8') + extra,
        ['require', 'module', 'exports', 'process', '__dirname', 'Date', 'setInterval', 'clearInterval'], {filename})(
        req, mod, mod.exports, {env}, path.dirname(filename), Clock, callback => { tick = callback; return 1; }, () => {});
    return {module: mod.exports, tick: () => tick()};
}
const quiet = {debug() {}, info() {}, warn() {}, error() {}};
async function settled(watcher) {
    for (let i = 0; i < 100 && watcher.inFlight; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(watcher.inFlight, false);
}

test('actual item watcher detects a three-minute late index update and survives restart', async t => {
    const env = {ITEM_WATCH_STATE_FILE: path.join(temp(t), 'state.json')};
    let now = 1800000000000; const start = now; const events = [];
    const base = {Id: 'old', Title: {NEUTRAL: 'Before'}, CreationDate: new Date(start - 10 * 86400000).toISOString(), LastModifiedDate: new Date(start - 86400000).toISOString()};
    let currentTitle = 'After';
    const mocks = {'../config/logger': quiet, '../utils/playfab': {
        isWatchableMarketplaceItem: () => true, getItemsByIds: async () => [],
        sendPlayFabRequest: async (_, endpoint, payload) => {
            const visible = now < start + 190000 ? base : {...base, Title: {NEUTRAL: currentTitle}, LastModifiedDate: new Date(start + 10000).toISOString()};
            if (endpoint === 'Catalog/GetItems') return {Items: [visible]};
            const match = /\((\w+) ge ([^)]+)\)/.exec(payload.Filter || '');
            if (!match) return {Items: [visible]};
            const prop = {creationdate: 'CreationDate', startdate: 'StartDate', lastmodifieddate: 'LastModifiedDate'}[match[1].toLowerCase()];
            return {Items: Date.parse(visible[prop] || '') >= Date.parse(match[2]) ? [visible] : []};
        }
    }};
    const load = () => loadWatcher('itemWatcher.js', env, mocks, () => now);
    const first = load(); const watcher = first.module.itemWatcher;
    const bus = {emit: (event, payload) => events.push({event, payload})};
    watcher.start(bus); await settled(watcher);
    assert.equal(watcher.bootstrapped, true);
    for (let seconds = 30; seconds <= 300; seconds += 30) { now = start + seconds * 1000; await first.tick(); }
    assert.equal(events.filter(e => e.event === 'item.updated').length, 1);
    assert.equal(events.find(e => e.event === 'item.updated').payload.items[0].after.snapshotComplete, true);
    watcher.stop(); currentTitle = 'Changed during downtime'; now += 3600000;
    const second = load(); second.module.itemWatcher.start(bus); await settled(second.module.itemWatcher);
    assert.equal(events.filter(e => e.event === 'item.updated').length, 2);
    second.module.itemWatcher.stop();
});

test('restart recovers items released more than one day ago during downtime', async t => {
    const env = {ITEM_WATCH_STATE_FILE: path.join(temp(t), 'state.json')};
    let now = Date.parse('2026-09-07T10:00:00Z');
    const events = []; let items = [];
    const mocks = {'../config/logger': quiet, '../utils/playfab': {
        isWatchableMarketplaceItem: () => true, getItemsByIds: async () => [],
        sendPlayFabRequest: async () => ({Items: items})
    }};
    const first = loadWatcher('itemWatcher.js', env, mocks, () => now);
    const bus = {emit: (event, payload) => events.push({event, payload})};
    first.module.itemWatcher.start(bus); await settled(first.module.itemWatcher); first.module.itemWatcher.stop();
    items = [{Id: 'tuesday-release', Title: {NEUTRAL: 'Released Tuesday'},
        CreationDate: '2026-09-01T10:00:00Z', StartDate: '2026-09-08T17:00:00Z', LastModifiedDate: '2026-09-08T17:00:00Z'}];
    now = Date.parse('2026-09-11T10:00:00Z');
    const second = loadWatcher('itemWatcher.js', env, mocks, () => now);
    second.module.itemWatcher.start(bus); await settled(second.module.itemWatcher);
    assert.equal(events.filter(e => e.event === 'item.created').length, 1);
    assert.equal(events.find(e => e.event === 'item.created').payload.items[0].id, 'tuesday-release');
    await second.tick();
    assert.equal(events.filter(e => e.event === 'item.created').length, 1);
    second.module.itemWatcher.stop();
});

test('400 initial search falls back; missing batch details are fetched individually, never fabricated', async () => {
    let missing = false; const calls = [];
    const loaded = loadWatcher('itemWatcher.js', {}, {'../config/logger': quiet, '../utils/playfab': {
        isWatchableMarketplaceItem: () => true, getItemsByIds: async () => [],
        sendPlayFabRequest: async (_, endpoint) => {
            calls.push(endpoint);
            if (endpoint === 'Catalog/SearchItems') throw Object.assign(new Error('unsupported'), {status: 400});
            if (endpoint === 'Catalog/Search') return {Items: [{Id: 'a'}, {Id: 'b'}]};
            if (endpoint === 'Catalog/GetItems') return {Items: [{Id: 'a'}]};
            return {Item: missing ? null : {Id: 'b', Title: {NEUTRAL: 'Complete', 'de-DE': 'Vollständig'}}};
        }
    }}, Date.now);
    const page = await loaded.module.probe.requestItems('title', 'iOS', '', '', null, 50);
    assert.deepEqual(page.items.map(i => i.Id), ['a', 'b']);
    assert.equal(page.items[1].Title['de-DE'], 'Vollständig');
    assert.ok(calls.includes('Catalog/GetItem'));
    missing = true;
    await assert.rejects(loaded.module.probe.requestItems('title', 'iOS', '', '', null, 50), /Incomplete watcher details/);
});

test('Featured state survives restart and is not advanced if event publication fails', async t => {
    const file = path.join(temp(t), 'featured.json');
    let items = [{id: 'old', title: 'Old'}]; const events = []; let fail = false;
    const bus = {emit(event) { if (fail) throw new Error('journal write failed'); events.push(event); }};
    const load = () => loadWatcher('featuredContentWatcher.js', {FEATURED_CONTENT_WATCH_STATE_FILE: file}, {
        '../config/logger': quiet, './featuredPersonaService': {fetchFeaturedPersona: async () => ({items})}
    }, Date.now);
    const first = load(); first.module.featuredContentWatcher.start(bus); await settled(first.module.featuredContentWatcher);
    assert.equal(events.length, 0); first.module.featuredContentWatcher.stop();
    items = [{id: 'new', title: 'New'}]; fail = true;
    const second = load(); const watcher = second.module.featuredContentWatcher;
    watcher.start(bus); await settled(watcher);
    assert.equal(watcher.lastError, 'journal write failed');
    assert.deepEqual(JSON.parse(fs.readFileSync(file)).ids, ['old']);
    fail = false; await second.tick();
    assert.ok(events.includes('featured.content.added'));
    assert.ok(events.includes('featured.content.removed'));
    assert.deepEqual(JSON.parse(fs.readFileSync(file)).ids, ['new']);
    watcher.stop();
});

test('Pass and Realms keep previous memberships after publication/upstream failures', async t => {
    const file = path.join(temp(t), 'subscriptions.json');
    const make = id => ({Id: id, Title: {NEUTRAL: id}});
    let version = 'old'; let failPublish = false; let failUpstream = false; const events = [];
    const loaded = loadWatcher('subscriptionWatcher.js', {SUBSCRIPTION_WATCH_STATE_FILE: file}, {
        '../config/logger': quiet,
        './marketplaceService': {fetchSubscriptionItems: async (_, key) => {
            if (failUpstream) throw Object.assign(new Error('upstream down'), {status: 503});
            return [make(`${key}-${version}`)];
        }}
    }, Date.now);
    const watcher = loaded.module.subscriptionWatcher;
    watcher.start({emit: event => {
        if (failPublish && event.endsWith('.added')) throw new Error('journal write failed');
        events.push(event);
    }});
    await settled(watcher); version = 'new'; failUpstream = true; await loaded.tick();
    assert.ok(watcher.state.marketplacePass.has('marketplacePass-old'));
    assert.ok(watcher.state.realmsPlus.has('realmsPlus-old'));
    failUpstream = false; failPublish = true; await loaded.tick();
    assert.ok(watcher.state.marketplacePass.has('marketplacePass-old'));
    failPublish = false; await loaded.tick();
    for (const prefix of ['marketplace.pass', 'realms.plus']) {
        assert.ok(events.includes(`${prefix}.added`));
        assert.ok(events.includes(`${prefix}.removed`));
    }
    watcher.stop();
});
