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
