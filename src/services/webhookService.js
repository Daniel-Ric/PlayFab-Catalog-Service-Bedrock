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
        if (event === "sale.update" && Array.isArray(p.changes)) {
            base.push(`changes: ${p.changes.length}`);
        } else if (event === "item.created" && Array.isArray(p.items)) {
            base.push(`created: ${p.items.length}`);
        } else if (event === "item.updated" && Array.isArray(p.items)) {
            base.push(`updated: ${p.items.length}`);
        } else if (event === "price.changed" && Array.isArray(p.changes)) {
            base.push(`priceChanges: ${p.changes.length}`);
        } else if (event === "item.snapshot" && typeof p.count === "number") {
            base.push(`snapshotCount: ${p.count}`);
        } else if (event === "sale.snapshot" && typeof p.stores === "number") {
            base.push(`saleStores: ${p.stores}`);
        } else if (event === "creator.trending" && Array.isArray(p.leaders)) {
            base.push(`leaders: ${p.leaders.length}`);
        }
    }
    return base.join("\n");
}

function buildDiscordBody(event, payload) {
    const tsIso = new Date(payload.ts || Date.now()).toISOString();
    const p = payload && payload.payload ? payload.payload : {};
    const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== "") ?? null;
    const fmtDate = v => (v ? new Date(v).toISOString() : null);
    const fmtCoins = v => (typeof v === "number" ? `${v} Minecoins` : "N/A");
    const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s);
    const forcedItem = p.item || null;
    let item = forcedItem || (Array.isArray(p.items) && p.items.length && (p.items[0].after || p.items[0])) || (Array.isArray(p.changes) && p.changes.length && p.changes[0].item) || null;
    const isItemCentric = !!item;
    const raw = item?.rawItem || item?.raw || null;
    const display = raw?.DisplayProperties || item?.displayProperties || {};
    const rating = raw?.Rating || item?.rating || {};
    const titleText = pick(item?.title, raw?.Title?.NEUTRAL, raw?.Title?.["en-US"], raw?.Title?.["en-GB"], item?.id, "Marketplace Item");
    const creatorName = pick(display.creatorName, item?.creatorName, "Unknown");
    const contentType = pick(raw?.ContentType, item?.contentType, "");
    const price = pick(display.price, item?.price, null);
    const priceText = fmtCoins(price);
    const friendlyId = (raw?.AlternateIds || []).find(a => a.Type === "FriendlyId")?.Value || null;
    const packIdentity = Array.isArray(display.packIdentity) ? display.packIdentity[0] : display.packIdentity || null;
    const languages = raw?.Title ? Object.keys(raw.Title).length : (item?.languages || null);
    const tags = raw?.Tags || item?.tags || [];
    const platforms = raw?.Platforms || item?.platforms || [];
    const images = raw?.Images || item?.images || [];
    const thumbnail = pick(images?.find(i => (i.Type || i.type) === "Thumbnail")?.Url, item?.thumbnail, images?.[0]?.Url);
    const hero = pick(images?.find(i => (i.Tag || i.tag) === "screenshot" || (i.Type || i.type) === "Screenshot")?.Url, images?.[0]?.Url, thumbnail);
    const description = pick(item?.description, raw?.Description?.NEUTRAL, raw?.Description?.["en-US"], "");
    const createdAt = pick(item?.createdAt, raw?.CreationDate, raw?.creationDate, null);
    const availableAt = pick(item?.startDate, raw?.StartDate, raw?.startDate, null);
    const lastModified = pick(raw?.LastModifiedDate, null);
    const etag = pick(raw?.ETag, null);
    const ratingAvg = pick(rating.Average, rating.average, null);
    const ratingCount = pick(rating.TotalCount, rating.totalcount, rating.count, null);
    const headline = creatorName && titleText ? `${titleText} — by ${creatorName}` : titleText || creatorName || "Marketplace Item";
    const descLines = [];
    if (description) descLines.push(trunc(String(description).replace(/\s+/g, " "), 350));
    if (contentType) descLines.push(`*Type:* ${contentType}`);
    if (friendlyId) descLines.push(`*FriendlyId:* \`${friendlyId}\``);
    if (packIdentity?.uuid) {
        const ver = packIdentity.version ? ` @ ${packIdentity.version}` : "";
        descLines.push(`*Pack:* \`${packIdentity.uuid}\`${ver}`);
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
    if (!isItemCentric) {
        const quick = [];
        if (event === "sale.update" && Array.isArray(p.changes)) quick.push(`sale buckets changed: **${p.changes.length}**`);
        if (event === "price.changed" && Array.isArray(p.changes)) quick.push(`price signatures changed: **${p.changes.length}**`);
        if (event === "sale.snapshot" && typeof p.stores === "number") quick.push(`sale stores snapshot: **${p.stores}**`);
        if (event === "item.snapshot" && typeof p.count === "number") quick.push(`item snapshot: **${p.count}**`);
        if (event === "creator.trending" && Array.isArray(p.leaders)) quick.push(`top creators (last ${payload.payload?.periodHours || "24"}h): **${p.leaders.length}**`);
        if (quick.length) fields.push({name: "Event", value: quick.join("\n"), inline: false});
    }
    const mainEmbed = {
        title: headline,
        description: descLines.join("\n"),
        timestamp: tsIso,
        footer: {text: "PlayFab Catalog API | By SpindexGFX"},
        fields
    };
    if (thumbnail) mainEmbed.thumbnail = {url: thumbnail};
    if (hero) mainEmbed.image = {url: hero};
    const extraScreens = (images || [])
        .map(i => i?.Url || i?.url)
        .filter(Boolean)
        .filter(u => u !== hero && u !== thumbnail)
        .slice(0, 3)
        .map(u => ({image: {url: u}, timestamp: tsIso}));
    return {content: `Webhook: ${event}`, embeds: [mainEmbed, ...extraScreens]};
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

function splitPayloads(event, payload) {
    const p = payload || {};
    if (event === "item.created" && Array.isArray(p.items)) {
        return p.items.map(it => ({ts: Date.now(), payload: {item: it}}));
    }
    if (event === "item.updated" && Array.isArray(p.items)) {
        return p.items.map(pair => ({
            ts: Date.now(),
            payload: {before: pair.before, after: pair.after, item: pair.after || pair.before}
        }));
    }
    if (event === "item.snapshot" && Array.isArray(p.items)) {
        return p.items.map(it => ({ts: Date.now(), payload: {item: it}}));
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
        const list = this.hooks.filter(h => h.event === event);
        if (!list.length) return;
        const units = splitPayloads(event, payload);
        if (!units.length) return;
        const concurrency = Math.max(1, parseInt(process.env.WEBHOOK_CONCURRENCY || "4", 10));
        let i = 0;
        while (i < units.length) {
            const slice = units.slice(i, i + concurrency);
            await Promise.all(slice.flatMap(u => list.map(h => {
                if (h.creator) {
                    const c = extractCreatorFromUnit(u);
                    if (!c || c !== h.creator) return Promise.resolve();
                }
                const key = `${h.id}:${event}:${unitKey(event, u)}`;
                if (this.inflight.has(key)) return this.inflight.get(key);
                const p = this.deliver(h, event, u).finally(() => this.inflight.delete(key));
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
                lastErr = new Error(String(r.status));
            } catch (e) {
                lastErr = e;
            }
            await new Promise(r => setTimeout(r, Math.min(10000, Math.pow(2, attempt) * 250 + Math.floor(Math.random() * 250))));
            attempt += 1;
        }
        logger.debug(`[Webhook] failure ${hook.url} ${lastErr ? (lastErr.message || "err") : "err"}`);
    }
}

const webhookService = new WebhookService();
module.exports = {webhookService};
