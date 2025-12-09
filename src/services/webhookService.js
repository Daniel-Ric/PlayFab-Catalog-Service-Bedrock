const crypto = require("crypto");
const path = require("path");
const {readJson, writeJsonAtomic} = require("../utils/storage");

const filePath = path.join(__dirname, "../data/webhooks.json");

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
    const arr = Array.from(cache.values());
    writeJsonAtomic(filePath, arr);
}

function generateId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return crypto.randomBytes(16).toString("hex");
}

function normalizeInput(input) {
    const now = new Date().toISOString();
    const url = String(input.url || "").trim();
    const rawEvents = Array.isArray(input.events) ? input.events : [];
    const events = rawEvents.length ? Array.from(new Set(rawEvents.map(e => String(e)))) : ["item.created"];
    const filters = input.filters && typeof input.filters === "object" ? {...input.filters} : {};
    if (Array.isArray(filters.creators)) {
        filters.creators = Array.from(new Set(filters.creators.map(c => String(c))));
    }
    return {
        id: generateId(),
        url,
        events,
        secret: input.secret ? String(input.secret) : null,
        active: input.active !== false,
        vendor: input.vendor ? String(input.vendor) : "generic",
        filters,
        createdAt: now,
        updatedAt: now
    };
}

function listWebhooks() {
    const map = loadAll();
    return Array.from(map.values());
}

function getWebhook(id) {
    const map = loadAll();
    return map.get(String(id)) || null;
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
        next.events = Array.from(new Set(patch.events.map(e => String(e))));
    }
    if (typeof patch.secret === "string") {
        next.secret = patch.secret.length ? patch.secret : null;
    }
    if (typeof patch.active === "boolean") next.active = patch.active;
    if (typeof patch.vendor === "string" && patch.vendor.trim()) next.vendor = patch.vendor.trim();
    if (patch.filters && typeof patch.filters === "object") {
        const f = {...next.filters, ...patch.filters};
        if (Array.isArray(f.creators)) {
            f.creators = Array.from(new Set(f.creators.map(c => String(c))));
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

function matchesCreatorFilter(filters, payload) {
    if (!filters || !Array.isArray(filters.creators) || !filters.creators.length) return true;
    const set = new Set(filters.creators.map(c => String(c).toLowerCase()));
    if (!payload || !Array.isArray(payload.items)) return true;
    for (const it of payload.items) {
        const n = it && it.creatorName ? String(it.creatorName).toLowerCase() : null;
        if (n && set.has(n)) return true;
    }
    return false;
}

function findMatchingWebhooks(eventName, payload) {
    const map = loadAll();
    const out = [];
    const name = String(eventName);
    for (const w of map.values()) {
        if (!w.active) continue;
        const ev = Array.isArray(w.events) ? w.events : [];
        if (!ev.includes(name) && !ev.includes("*")) continue;
        if (!matchesCreatorFilter(w.filters, payload)) continue;
        out.push(w);
    }
    return out;
}

module.exports = {
    listWebhooks, getWebhook, createWebhook, updateWebhook, deleteWebhook, findMatchingWebhooks
};
