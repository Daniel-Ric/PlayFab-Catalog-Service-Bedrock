const crypto = require("crypto");
const path = require("path");
const {readJson, writeJsonAtomic} = require("../utils/storage");
const {getCreatorNamesFromPayload} = require("../utils/eventPayload");

const filePath = path.join(__dirname, "./data/webhooks.json");

let cache = null;

function loadAll() {
    if (!cache) {
        const arr = readJson(filePath, []);
        const map = new Map();
        for (const w of arr) {
            if (w && w.id) map.set(String(w.id), w);
        }
        cache = map;
    }
    return cache;
}

function saveAll() {
    if (!cache) return;
    writeJsonAtomic(filePath, Array.from(cache.values()));
}

function generateId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return crypto.randomBytes(16).toString("hex");
}

function normalizeInput(input) {
    const now = new Date().toISOString();
    const url = String(input.url || "").trim();

    const rawEvents = Array.isArray(input.events) ? input.events : [];
    const cleanedEvents = rawEvents.map(e => String(e).trim()).filter(Boolean);
    const events = cleanedEvents.length ? Array.from(new Set(cleanedEvents)) : ["item.created"];

    const filters = input.filters && typeof input.filters === "object" ? {...input.filters} : {};
    if (Array.isArray(filters.creators)) {
        const creators = filters.creators.map(c => String(c).trim()).filter(Boolean);
        filters.creators = Array.from(new Set(creators));
    }

    const vendor = input.vendor ? String(input.vendor).trim() : "generic";

    return {
        id: generateId(),
        url,
        events,
        secret: input.secret ? String(input.secret) : null,
        active: input.active !== false,
        vendor: vendor || "generic",
        filters,
        createdAt: now,
        updatedAt: now
    };
}

function listWebhooks() {
    return Array.from(loadAll().values());
}

function getWebhook(id) {
    return loadAll().get(String(id)) || null;
}

function createWebhook(input) {
    const map = loadAll();
    const w = normalizeInput(input);
    map.set(w.id, w);
    saveAll();
    return w;
}

function updateWebhook(id, patch) {
    const map = loadAll();
    const key = String(id);
    const existing = map.get(key);
    if (!existing) {
        const e = new Error("Webhook not found");
        e.status = 404;
        throw e;
    }

    const now = new Date().toISOString();
    const next = {...existing};

    if (typeof patch.url === "string" && patch.url.trim()) next.url = patch.url.trim();

    if (Array.isArray(patch.events) && patch.events.length) {
        const ev = patch.events.map(e => String(e).trim()).filter(Boolean);
        if (ev.length) next.events = Array.from(new Set(ev));
    }

    if (typeof patch.secret === "string") next.secret = patch.secret.length ? patch.secret : null;
    if (typeof patch.active === "boolean") next.active = patch.active;
    if (typeof patch.vendor === "string" && patch.vendor.trim()) next.vendor = patch.vendor.trim();

    if (patch.filters && typeof patch.filters === "object") {
        const f = {...(next.filters || {}), ...patch.filters};
        if (Array.isArray(f.creators)) {
            const creators = f.creators.map(c => String(c).trim()).filter(Boolean);
            f.creators = Array.from(new Set(creators));
        }
        next.filters = f;
    }

    next.updatedAt = now;
    map.set(key, next);
    saveAll();
    return next;
}

function deleteWebhook(id) {
    const map = loadAll();
    const key = String(id);
    const existed = map.delete(key);
    saveAll();
    return existed;
}

function matchesCreatorFilter(filters, eventName, payload) {
    if (!filters || !Array.isArray(filters.creators) || !filters.creators.length) return true;
    const set = new Set(filters.creators.map(c => String(c).toLowerCase()));
    const names = getCreatorNamesFromPayload(eventName, payload);
    if (!names.length) return true;
    for (const n of names) {
        if (set.has(n)) return true;
    }
    return false;
}

function findMatchingWebhooks(eventName, payload) {
    const map = loadAll();
    const out = [];
    const name = String(eventName);

    for (const w of map.values()) {
        if (!w || !w.active) continue;
        const ev = Array.isArray(w.events) ? w.events : [];
        if (!ev.includes(name) && !ev.includes("*")) continue;
        if (!matchesCreatorFilter(w.filters, name, payload)) continue;
        out.push(w);
    }

    return out;
}

module.exports = {
    listWebhooks, getWebhook, createWebhook, updateWebhook, deleteWebhook, findMatchingWebhooks
};
