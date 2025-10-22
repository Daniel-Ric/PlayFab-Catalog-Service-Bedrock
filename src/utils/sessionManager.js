const axios = require("axios");
const {Mutex} = require("async-mutex");
const {sessionCache} = require("../config/cache");
const {resolveTitle} = require("./titles");
const logger = require("../config/logger");
const crypto = require("crypto");

const mutex = new Mutex();
const OS = process.env.OS || "IOS";

/**
 * Login + EntityToken holen und cachen.
 */
async function loginWithIOSDeviceID(titleId) {
    const deviceId = `ios-${Date.now()}-${Math.random().toString(36).substr(2, 10)}`;
    logger.info(`→ LOGIN    Title=${titleId}  DeviceID=${deviceId}`);
    const r = await axios.post(
        `https://${titleId}.playfabapi.com/Client/LoginWithIOSDeviceID`,
        {CreateAccount: true, TitleId: titleId, DeviceId: deviceId, OS},
        {headers: {"Content-Type": "application/json"}}
    );
    return r.data.data;
}

async function getEntityTokenRequest(titleId, ticket, pfId) {
    logger.info(`→ TOKEN    Title=${titleId}`);
    const r = await axios.post(
        `https://${titleId}.playfabapi.com/Authentication/GetEntityToken`,
        {Entity: {Id: pfId, Type: "master_player_account"}},
        {headers: {"Content-Type": "application/json", "X-Authorization": ticket}}
    );
    return r.data.data.EntityToken;
}

/**
 * Gibt ein Objekt { SessionTicket, PlayFabId, EntityToken } zurück,
 * cached es und verhindert parallele Logins.
 */
async function getSession(alias) {
    const titleId = resolveTitle(alias);
    const key = `session_${titleId}`;
    if (sessionCache.has(key)) return sessionCache.get(key);

    return mutex.runExclusive(async () => {
        if (sessionCache.has(key)) return sessionCache.get(key);

        const {SessionTicket, PlayFabId} = await loginWithIOSDeviceID(titleId);
        const EntityToken = await getEntityTokenRequest(titleId, SessionTicket, PlayFabId);
        const s = {SessionTicket, PlayFabId, EntityToken};
        sessionCache.set(key, s);
        return s;
    });
}

module.exports = {getSession};
