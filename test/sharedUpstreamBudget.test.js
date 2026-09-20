const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {withSharedSearchBudget} = require('../src/services/sharedUpstreamBudget');
test('independent coordinators share search concurrency and release the lock on failure', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-budget-'));
    let active = 0, maxActive = 0;
    const task = async () => { active++; maxActive = Math.max(maxActive, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; };
    try {
        await Promise.all([withSharedSearchBudget(directory, 'title:search', 5, task), withSharedSearchBudget(directory, 'title:search', 5, task)]);
        assert.equal(maxActive, 1);
        await assert.rejects(withSharedSearchBudget(directory, 'title:search', 0, async () => { throw new Error('failed'); }));
        await withSharedSearchBudget(directory, 'title:search', 0, task);
    } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});
