"use strict";
const fs = require('node:fs');
const os = require('node:os');


function recoverLocalLock(lockPath) {
    const recoveryPath = `${lockPath}.recovery`;
    let handle;
    try { handle = fs.openSync(recoveryPath, 'wx'); } catch { return false; }
    try {
        let owner;
        try { owner = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { return false; }
        if (owner.host !== os.hostname() || !Number.isInteger(owner.pid) || owner.pid < 1) return false;
        try { process.kill(owner.pid, 0); } catch (error) {
            if (error.code === 'ESRCH') { fs.unlinkSync(lockPath); return true; }
        }
        return false;
    } finally { fs.closeSync(handle); fs.unlinkSync(recoveryPath); }
}
module.exports = {recoverLocalLock};
