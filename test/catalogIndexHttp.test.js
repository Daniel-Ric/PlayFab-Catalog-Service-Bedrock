const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {CatalogOfferIndex, projectOffer} = require('../src/services/catalogOfferIndex');
const {createCatalogIndexRouter} = require('../src/routes/marketplace/catalog-index');

test('public index HTTP reads are bounded, revalidated, and reject query-mismatched cursors', async () => {
    const app = express();
    const index = new CatalogOfferIndex({id: 'snapshot', updatedAt: new Date().toISOString(), items: Array.from({length: 60}, (_, i) =>
        projectOffer({Id: String(i), ContentType: 'MarketplaceDurableCatalog_V1.2', Tags: ['skinpack'], DisplayProperties: {creatorName: 'Creator'}, Title: {NEUTRAL: 'Item'}}))});
    app.use('/marketplace', createCatalogIndexRouter(() => ({index, query: input => index.query(input), refreshReader() {}, coverage: () => index.coverage()})));
    app.use((error, req, res, next) => res.status(error.status || 500).json({error: error.message}));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/marketplace/browse`;
    try {
        const first = await fetch(url);
        assert.equal(first.status, 200); assert.equal(first.headers.get('cache-control'), 'no-store');
        const data = await first.json(); assert.equal(data.items.length, 24); assert.equal(data.meta.total, 60);
        const cachedStatus = await new Promise((resolve, reject) => {
            require('node:http').get(url, {headers: {'If-None-Match': first.headers.get('etag')}}, response => {
                response.resume(); resolve(response.statusCode);
            }).on('error', reject);
        });
        assert.equal(cachedStatus, 304);
        const mismatch = await fetch(`${url}?category=worldtemplate&cursor=${data.pagination.nextCursor}`);
        assert.equal(mismatch.status, 400);
        index.snapshot.id = 'new';
        assert.equal((await fetch(`${url}?cursor=${data.pagination.nextCursor}`)).status, 409);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
