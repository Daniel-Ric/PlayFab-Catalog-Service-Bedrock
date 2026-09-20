"use strict";
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));



async function withSharedSearchBudget(directory, key, minTime, task) {
    await fs.mkdir(directory, {recursive: true});
    const lockPath = path.join(directory, `${crypto.createHash('sha256').update(key).digest('hex')}.lock`);
    const deadline = Date.now() + 60000;
    let handle;
    while (!handle) {
        try {
            handle = await fs.open(lockPath, 'wx');
            await handle.writeFile(JSON.stringify({pid: process.pid, host: os.hostname()}));
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            if (require('./catalogLockRecovery').recoverLocalLock(lockPath)) continue;
            if (Date.now() >= deadline) throw Object.assign(new Error('Shared PlayFab budget is busy'), {status: 503});
            await pause(50);
        }
    }
    const started = Date.now();
    try { return await task(); } finally {
        await pause(Math.max(0, minTime - (Date.now() - started)));
        await handle.close();
        await fs.unlink(lockPath);
    }
}
module.exports = {withSharedSearchBudget};
