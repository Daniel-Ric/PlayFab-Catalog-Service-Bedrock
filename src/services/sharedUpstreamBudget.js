"use strict";
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {retryAfterMs} = require('../utils/retryAfter');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));


async function writeBudgetState(file, nextStartAt) {
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({nextStartAt}));
    await fs.rename(temporary, file);
}

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
    const statePath = `${lockPath}.json`;
    let nextStartAt = 0;
    let response;
    try {
        try {
            const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
            nextStartAt = Number(state.nextStartAt) || 0;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        while (nextStartAt > Date.now()) await pause(Math.min(2147483647, nextStartAt - Date.now()));
        nextStartAt = Date.now() + minTime;
        await writeBudgetState(statePath, nextStartAt);
        try {
            response = await task();
            return response;
        } catch (error) {
            response = error.response;
            throw error;
        } finally {
            const delay = retryAfterMs(response);
            if (delay !== null) {
                nextStartAt = Math.max(nextStartAt, Date.now() + delay);
                await writeBudgetState(statePath, nextStartAt);
            }
        }
    } finally {
        try { await handle.close(); } finally { await fs.unlink(lockPath); }
    }
}
module.exports = {withSharedSearchBudget};
