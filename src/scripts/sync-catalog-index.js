"use strict";
require('dotenv').config();
const {getCatalogIndexStore} = require('../services/catalogIndexStore');
const store = getCatalogIndexStore();
if (process.argv.includes('--status')) {
    console.log(JSON.stringify(store.coverage(), null, 2));
} else {
    const pageArg = process.argv.find(arg => arg.startsWith('--max-pages='));
    const maxPages = pageArg ? Number(pageArg.split('=')[1]) : Infinity;
    if (maxPages !== Infinity && (!Number.isInteger(maxPages) || maxPages < 1)) throw new Error('Invalid --max-pages');
    store.sync({incremental: process.argv.includes('--incremental'), maxPages})
        .then(coverage => { console.log(JSON.stringify(coverage, null, 2)); if (coverage.sync?.lastError) process.exitCode = 1; })
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}
