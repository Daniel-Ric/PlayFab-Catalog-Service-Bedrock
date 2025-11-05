const path = require("path");
const axios = require("axios");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const {stableHash} = require("../utils/hash");
const {readJson, writeJsonAtomic} = require("../utils/storage");
const {eventBus} = require("./eventBus");
const logger = require("../config/logger");

const file = path.join(__dirname, "..", "data", "webhooks.json");

const httpAgent = new http.Agent({keepAlive: true, maxSockets: 64});
const httpsAgent = new https.Agent({keepAlive: true, maxSockets: 64});
const httpClient = axios.create({
    httpAgent,
    httpsAgent,
    timeout: Math.max(2000, parseInt(process.env.WEBHOOK_TIMEOUT_MS || "5000", 10)),
    validateStatus: () => true
});

function detectProvider(url, override) {
    if (override && typeof override === "string") return override.toLowerCase();
    try {
        const u = new URL(url);
        const h = u.hostname.toLowerCase();
        if (h.includes("discord.com") || h.includes("discordapp.com")) return "discord";
        if (h.includes("hooks.slack.com")) return "slack";
        if (h.includes("chat.googleapis.com")) return "googlechat";
        if (h.includes("outlook.office.com") || h.includes("office.com") || h.includes("teams.microsoft.com")) return "teams";
        return "generic";
    } catch {
        return "generic";
    }
}

function toPlainText(event, payload) {
    const ts = new Date(payload.ts || Date.now()).toISOString();
    const base = [`event: ${event}`, `ts: ${ts}`];
    if (payload && payload.payload && typeof payload.payload === "object") {
        const p = payload.payload;
        if (event === "sale.update" && Array.isArray(p.changes)) base.push(`changes: ${p.changes.length}`); else if (event === "item.created" && Array.isArray(p.items)) base.push(`created: ${p.items.length}`); else if (event === "item.updated" && Array.isArray(p.items)) base.push(`updated: ${p.items.length}`); else if (event === "price.changed" && Array.isArray(p.changes)) base.push(`priceChanges: ${p.changes.length}`); else if (event === "item.snapshot" && typeof p.count === "number") base.push(`snapshotCount: ${p.count}`); else if (event === "sale.snapshot" && typeof p.stores === "number") base.push(`saleStores: ${p.stores}`); else if (event === "creator.trending" && Array.isArray(p.leaders)) base.push(`leaders: ${p.leaders.length}`);
    }
    return base.join("\n");
}

function buildDiscordBody(event, payload) {
    const tsIso = new Date(payload.ts || Date.now()).toISOString();
    const p = payload && payload.payload ? payload.payload : {};
    const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== "") ?? null;
    const fmtDate = v => (v ? new Date(v).toISOString() : null);
    const fmtCoins = v => (typeof v === "number" ? `${v} Minecoins` : "N/A");
    const trunc = (s, n) => {
        const t = String(s || "");
        return t.length > n ? t.slice(0, n - 1) + "…" : t;
    };
    const makeEmbed = (it) => {
        const raw = it?.rawItem || it?.raw || null;
        const display = raw?.DisplayProperties || it?.displayProperties || {};
        const rating = raw?.Rating || it?.rating || {};
        const titleText = pick(it?.title, raw?.Title?.NEUTRAL, raw?.Title?.["en-US"], raw?.Title?.["en-GB"], it?.id, "Marketplace Item");
        const creatorName = pick(display.creatorName, it?.creatorName, "");
        const contentType = pick(raw?.ContentType, it?.contentType, "");
        const price = pick(display.price, it?.price, null);
        const priceText = fmtCoins(price);
        const friendlyId = (raw?.AlternateIds || []).find(a => a.Type === "FriendlyId")?.Value || null;
        const packIdentityRaw = Array.isArray(display.packIdentity) ? display.packIdentity[0] : display.packIdentity || null;
        const languages = raw?.Title ? Object.keys(raw.Title).length : (it?.languages || null);
        const tags = raw?.Tags || it?.tags || [];
        const platforms = raw?.Platforms || it?.platforms || [];
        const images = raw?.Images || it?.images || [];
        const thumbnail = pick(images?.find(i => (i.Type || i.type) === "thumbnail")?.Url, it?.thumbnail, images?.[0]?.Url);
        const hero = pick(images?.find(i => (i.Tag || i.tag) === "screenshot" || (i.Type || i.type) === "Screenshot")?.Url, images?.[0]?.Url, thumbnail);
        const description = pick(it?.description, raw?.Description?.NEUTRAL, raw?.Description?.["en-US"], "");
        const createdAt = pick(it?.createdAt, raw?.CreationDate, raw?.creationDate, null);
        const availableAt = pick(it?.startDate, raw?.StartDate, raw?.startDate, null);
        const lastModified = pick(raw?.LastModifiedDate, null);
        const etag = pick(raw?.ETag, null);
        const ratingAvg = pick(rating.Average, rating.average, null);
        const ratingCount = pick(rating.TotalCount, rating.totalcount, rating.count, null);
        const headline = creatorName ? `${titleText} — by ${creatorName}` : titleText || "Marketplace Item";
        const descLines = [];
        if (description) descLines.push(trunc(String(description).replace(/\s+/g, " "), 350));
        if (contentType) descLines.push(`Type: ${contentType}`);
        if (friendlyId) descLines.push(`FriendlyId: \`${friendlyId}\``);
        if (packIdentityRaw && (packIdentityRaw.uuid || packIdentityRaw.id)) {
            const uuid = packIdentityRaw.uuid || packIdentityRaw.id;
            const ver = packIdentityRaw.version ? ` @ ${packIdentityRaw.version}` : "";
            descLines.push(`Pack: \`${uuid}\`${ver}`);
        }
        const fields = [];
        fields.push({name: "Price", value: priceText, inline: true});
        if (ratingAvg !== null || ratingCount !== null) {
            const r = ratingAvg !== null ? `${ratingAvg}` : "—";
            const c = ratingCount !== null ? `${ratingCount}` : "—";
            fields.push({name: "Rating", value: `⭐ ${r} (${c})`, inline: true});
        }
        if (languages) fields.push({name: "Locales", value: String(languages), inline: true});
        if (tags && tags.length) fields.push({
            name: "Tags",
            value: trunc(tags.slice(0, 10).join(", "), 1024),
            inline: false
        });
        if (platforms && platforms.length) fields.push({name: "Platforms", value: platforms.join(", "), inline: false});
        const dateBlock = [];
        if (createdAt) dateBlock.push(`Upload: ${fmtDate(createdAt)}`);
        if (availableAt) dateBlock.push(`Available: ${fmtDate(availableAt)}`);
        if (lastModified) dateBlock.push(`Last Modified: ${fmtDate(lastModified)}`);
        if (etag) dateBlock.push(`ETag: \`${etag}\``);
        if (dateBlock.length) fields.push({name: "Meta", value: dateBlock.join("\n"), inline: false});
        const embed = {
            title: headline,
            description: descLines.join("\n"),
            timestamp: tsIso,
            footer: {text: "PlayFab Catalog API | By SpindexGFX"},
            fields
        };
        if (thumbnail) embed.thumbnail = {url: thumbnail};
        if (hero) embed.image = {url: hero};
        return embed;
    };
    const items = Array.isArray(p.items) ? p.items : [(p.item || p.after || p.before || null)].filter(Boolean);
    if (items.length) {
        const embeds = items.slice(0, 10).map(makeEmbed);
        return {content: `Webhook: ${event}`, embeds};
    }
    const forcedItem = p.item || null;
    const it = forcedItem || (Array.isArray(p.items) && p.items.length && (p.items[0].after || p.items[0])) || (Array.isArray(p.changes) && p.changes.length && p.changes[0].item) || null;
    if (it) return {content: `Webhook: ${event}`, embeds: [makeEmbed(it)]};
    return {content: `Webhook: ${event}`, embeds: []};
}

function buildSlackBody(event, payload) {
    return {text: toPlainText(event, payload)};
}

function buildGoogleChatBody(event, payload) {
    return {text: toPlainText(event, payload)};
}

function buildTeamsBody(event, payload) {
    const text = toPlainText(event, payload);
    return {
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        summary: event,
        themeColor: "0076D7",
        title: event,
        text
    };
}

function buildGenericBody(event, payload) {
    return {event, ts: Date.now(), payload};
}

function signGenericBody(secret, body) {
    const payload = JSON.stringify(body);
    const ts = Date.now().toString();
    const h = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
    return {ts, sig: `sha256=${h}`};
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function splitPayloads(event, payload) {
    const p = payload || {};
    const N = 8;
    if ((event === "item.created" || event === "item.snapshot") && Array.isArray(p.items)) {
        const chunks = chunk(p.items, N);
        return chunks.map(items => ({ts: Date.now(), payload: {items}}));
    }
    if (event === "item.updated" && Array.isArray(p.items)) {
        const chunks = chunk(p.items, N);
        return chunks.map(items => ({ts: Date.now(), payload: {items, updated: true}}));
    }
    if (event === "price.changed" && Array.isArray(p.changes)) {
        return p.changes.map(ch => ({ts: Date.now(), payload: {change: ch, itemId: ch.itemId}}));
    }
    if (event === "sale.update" && Array.isArray(p.changes)) {
        return p.changes.map(ch => ({ts: Date.now(), payload: {change: ch}}));
    }
    if (event === "creator.trending" && Array.isArray(p.leaders)) {
        return p.leaders.map(l => ({
            ts: Date.now(),
            payload: {creator: l.creator, score: l.score, periodHours: p.periodHours}
        }));
    }
    return [{ts: Date.now(), payload: p}];
}

function unitKey(event, unit) {
    const u = unit || {};
    if (u.payload && u.payload.item && u.payload.item.id) return String(u.payload.item.id);
    if (u.payload && u.payload.after && u.payload.after.id) return String(u.payload.after.id);
    if (u.payload && typeof u.payload.itemId !== "undefined") return String(u.payload.itemId);
    if (u.payload && u.payload.change && u.payload.change.storeId) return `store:${u.payload.change.storeId}`;
    if (u.payload && typeof u.payload.creator === "string") return `creator:${u.payload.creator}`;
    return String(u.ts || Date.now());
}

function normCreator(v) {
    return String(v || "").toLowerCase().replace(/\s+/g, "");
}

function extractCreatorFromUnit(u) {
    const p = (u && u.payload) || {};
    const cand = p.item?.creatorName || p.after?.creatorName || p.before?.creatorName || p.creator || p.creatorName || null;
    return normCreator(cand);
}

const perHookQueues = new Map();

function enqueueForHook(hookId, job) {
    const prev = perHookQueues.get(hookId) || Promise.resolve();
    const next = prev.then(job).catch(() => {
    }).finally(() => {
    });
    perHookQueues.set(hookId, next);
    return next;
}

const dedupeMap = new Map();

function dedupeHit(key, ttlMs) {
    const now = Date.now();
    const prev = dedupeMap.get(key);
    if (prev && now - prev < ttlMs) return true;
    dedupeMap.set(key, now);
    return false;
}

class WebhookService {
    constructor() {
        this.hooks = [];
        this.inflight = new Map();
        this.load();
        eventBus.on("sale.update", p => this.dispatch("sale.update", p));
        eventBus.on("sale.snapshot", p => this.dispatch("sale.snapshot", p));
        eventBus.on("item.snapshot", p => this.dispatch("item.snapshot", p));
        eventBus.on("item.created", p => this.dispatch("item.created", p));
        eventBus.on("item.updated", p => this.dispatch("item.updated", p));
        eventBus.on("price.changed", p => this.dispatch("price.changed", p));
        eventBus.on("creator.trending", p => this.dispatch("creator.trending", p));
    }

    load() {
        try {
            this.hooks = readJson(file, []);
        } catch {
            this.hooks = [];
        }
    }

    persist() {
        try {
            writeJsonAtomic(file, this.hooks);
        } catch {
        }
    }

    async register({event, url, secret, provider, creator}) {
        if (!event || !url) throw new Error("event and url required");
        const prov = detectProvider(url, provider);
        const creatorNorm = creator ? normCreator(creator) : null;
        const id = stableHash({event, url, secret: secret || "", provider: prov, creator: creatorNorm || ""});
        const now = Date.now();
        const existing = this.hooks.find(h => h.id === id);
        const hook = existing ? existing : {
            id,
            event,
            url,
            provider: prov,
            secret: secret || null,
            createdAt: now,
            updatedAt: now,
            failures: 0,
            lastStatus: null,
            creator: creatorNorm || null,
            creatorDisplay: creator || null
        };
        hook.updatedAt = now;
        hook.creator = creatorNorm || null;
        hook.creatorDisplay = creator || null;
        if (!existing) this.hooks.push(hook);
        this.persist();
        return hook;
    }

    async list() {
        return this.hooks.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    async remove(id) {
        const before = this.hooks.length;
        this.hooks = this.hooks.filter(h => h.id !== id);
        const changed = this.hooks.length !== before;
        if (changed) this.persist();
        return changed;
    }

    async dispatch(event, payload) {
        let list = this.hooks.filter(h => h.event === event);
        if (!list.length) return;
        if (event === "item.snapshot" || event === "sale.snapshot") {
            list = list.filter(h => h.provider !== "discord");
            if (!list.length) return;
        }
        const units = splitPayloads(event, payload);
        if (!units.length) return;
        const dropUnknown = String(process.env.WEBHOOK_DROP_UNKNOWN_CREATORS || "true").toLowerCase() === "true";
        const ttl = Math.max(0, parseInt(process.env.WEBHOOK_DEDUPE_TTL_MS || "60000", 10));
        const concurrency = Math.max(1, parseInt(process.env.WEBHOOK_CONCURRENCY || "4", 10));
        let i = 0;
        while (i < units.length) {
            const slice = units.slice(i, i + concurrency);
            await Promise.all(slice.flatMap(u => list.map(h => {
                if (h.creator) {
                    const c = extractCreatorFromUnit(u);
                    if (!c || c !== h.creator) return Promise.resolve();
                } else if (dropUnknown) {
                    const c = extractCreatorFromUnit(u);
                    if (!c) return Promise.resolve();
                }
                const key = `${h.id}:${event}:${unitKey(event, u)}`;
                if (dedupeHit(key, ttl)) return Promise.resolve();
                if (this.inflight.has(key)) return this.inflight.get(key);
                const job = () => this.deliver(h, event, u);
                const p = enqueueForHook(h.id, job).finally(() => this.inflight.delete(key));
                this.inflight.set(key, p);
                return p;
            })));
            i += concurrency;
        }
    }

    async sendAll(list, event, payload) {
        const concurrency = Math.max(1, parseInt(process.env.WEBHOOK_CONCURRENCY || "4", 10));
        for (let i = 0; i < list.length; i += concurrency) {
            const chunk = list.slice(i, i + concurrency);
            await Promise.all(chunk.map(h => this.deliver(h, event, payload)));
        }
    }

    buildBodyAndHeaders(hook, event, payload) {
        const provider = hook.provider || detectProvider(hook.url);
        const core = (payload && payload.payload) ? payload.payload : payload;
        if (provider === "discord") return {
            body: buildDiscordBody(event, {event, ts: Date.now(), payload: core}),
            headers: {"Content-Type": "application/json"}
        };
        if (provider === "slack") return {
            body: buildSlackBody(event, {event, ts: Date.now(), payload: core}),
            headers: {"Content-Type": "application/json"}
        };
        if (provider === "googlechat") return {
            body: buildGoogleChatBody(event, {event, ts: Date.now(), payload: core}),
            headers: {"Content-Type": "application/json"}
        };
        if (provider === "teams") return {
            body: buildTeamsBody(event, {event, ts: Date.now(), payload: core}),
            headers: {"Content-Type": "application/json"}
        };
        const body = buildGenericBody(event, core);
        const headers = {"Content-Type": "application/json"};
        if (hook.secret) {
            const sig = signGenericBody(hook.secret, body);
            headers["X-Webhook-Timestamp"] = sig.ts;
            headers["X-Webhook-Signature"] = sig.sig;
        }
        return {body, headers};
    }

    async deliver(hook, event, payload) {
        const {body, headers} = this.buildBodyAndHeaders(hook, event, payload);
        const maxRetries = Math.max(0, parseInt(process.env.WEBHOOK_MAX_RETRIES || "3", 10));
        let attempt = 0;
        let lastErr = null;
        while (attempt <= maxRetries) {
            try {
                const r = await httpClient.post(hook.url, body, {headers});
                hook.lastStatus = r.status;
                hook.failures = r.status >= 200 && r.status < 300 ? 0 : hook.failures + 1;
                hook.updatedAt = Date.now();
                this.persist();
                if (r.status >= 200 && r.status < 300) return;
                if (r.status === 429) {
                    let retryAfterMs = 0;
                    const raBody = r.data && typeof r.data.retry_after !== "undefined" ? Number(r.data.retry_after) : 0;
                    const raHdr = r.headers && typeof r.headers["retry-after"] !== "undefined" ? Number(r.headers["retry-after"]) : 0;
                    if (Number.isFinite(raBody) && raBody > 0) retryAfterMs = raBody >= 1000 ? raBody : raBody * 1000; else if (Number.isFinite(raHdr) && raHdr > 0) retryAfterMs = raHdr * 1000;
                    if (!retryAfterMs) retryAfterMs = 2500;
                    await new Promise(res => setTimeout(res, Math.max(500, retryAfterMs)));
                    attempt++;
                    continue;
                }
            } catch (e) {
                lastErr = e;
            }
            const wait = Math.min(15000, Math.pow(2, attempt) * 400 + Math.floor(Math.random() * 300));
            await new Promise(res => setTimeout(res, wait));
            attempt++;
        }
        logger.debug(`[Webhook] failure ${hook.url} ${lastErr ? (lastErr.message || "err") : "err"}`);
    }
}

const webhookService = new WebhookService();
module.exports = {webhookService};
