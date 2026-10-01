const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {createRequire} = require('node:module');
const file = require.resolve('../src/services/advancedSearchService');

function service(fetchPage) {
    const realRequire = createRequire(file), exports = {};
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {exports, process, console,
        require: name => name === '../utils/titles' ? {resolveTitle: () => 'title'} : name === '../utils/playfab'
            ? {...realRequire(name), sendPlayFabRequest: fetchPage, transformItem: item => item} : realRequire(name)});
    return exports;
}
test('a failed second upstream page retains the first page and its retry cursor', async () => {
    let calls = 0;
    const result = await service(async () => {
        if (++calls === 2) throw Object.assign(new Error('Upstream error 400'), {publicMessage: 'Skip must be between 0 and 10000, inclusively'});
        return {Items: [{Id: 'one'}], ContinuationToken: 'retry-this'};
    }).advancedSearch('prod', {mode: 'cursor', count: 50, cursorPages: 3}, {page: 1, pageSize: 50});
    assert.equal(result.items[0].Id, 'one');
    assert.equal(result.meta.continuationToken, 'retry-this');
    assert.equal(result.coverage.status, 'partial');
    assert.equal(result.coverage.reason, 'upstream_search_window');
});
test('an API cursor repetition is explicit partial coverage', async () => {
    const result = await service(async () => ({Items: [{Id: 'one'}], ContinuationToken: 'same'}))
        .advancedSearch('prod', {mode: 'cursor', count: 50, cursorPages: 3}, {page: 1, pageSize: 50});
    assert.equal(result.coverage.status, 'partial');
    assert.equal(result.meta.cursorRepeated, true);
});

test('piece type filters preserve continuation through empty filtered pages', async () => {
    const api = service(async (_, endpoint, payload) => {
        assert.equal(endpoint, 'Catalog/SearchItems');
        assert.ok(!payload.Filter.includes('pieceType'));
        return payload.ContinuationToken ? {Items: [{Id: 'cape', DisplayProperties: {pieceType: 'persona_capes'}}]}
            : {Items: [{Id: 'hat', DisplayProperties: {pieceType: 'persona_hood'}}], ContinuationToken: 'next'};
    });
    const body = {mode: 'cursor', filters: {contentKinds: ['persona'], pieceType: 'persona_capes'}};
    const first = await api.advancedSearch('prod', body, {page: 1, pageSize: 50});
    assert.equal(first.items.length, 0);
    assert.equal(first.meta.continuationToken, 'next');
    const last = await api.advancedSearch('prod', {...body, continuationToken: first.meta.continuationToken}, {page: 1, pageSize: 50});
    assert.equal(last.items[0].Id, 'cape');
    assert.equal(last.coverage.status, 'complete');
    assert.equal(api._internals.hasLocalOnlyFilters(body.filters), true);
});

test('advanced piece type exclusions preserve cosmetics and missing subtypes', () => {
    const api = service(async () => ({}));
    const items = ['persona_capes', 'persona_emote', 'persona_hood', ''].map(pieceType => ({DisplayProperties: {pieceType}}));
    for (const excludePieceTypes of [['persona_emote', 'persona_capes'], 'persona_capes']) {
        const {filters} = api._internals.validateRequestBody({filters: {excludePieceTypes}});
        const result = api._internals.applyApiLayerFilters(items, filters);
        assert.ok(result.every(item => item.DisplayProperties.pieceType !== 'persona_capes'));
        assert.ok(result.some(item => item.DisplayProperties.pieceType === 'persona_hood'));
        assert.ok(result.some(item => item.DisplayProperties.pieceType === ''));
        assert.equal(result.length, Array.isArray(excludePieceTypes) ? 2 : 3);
        assert.equal(api._internals.hasLocalOnlyFilters(filters), true);
    }
});
