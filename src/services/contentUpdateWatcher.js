// -----------------------------------------------------------------------------
//
// File: src/services/contentUpdateWatcher.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
// No partnership, approval, or official relationship with Mojang AB or Microsoft is implied.
//
// All names, logos, brands, trademarks, service marks, and registered trademarks are the
// property of their respective owners and are used strictly for identification/reference only.
// This project does not claim ownership of third-party IP and provides no license to use it.
//
// -----------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const logger = require("../config/logger");
const {stableHash} = require("../utils/hash");
const {createNonOverlappingRunner} = require("../utils/watcherRun");
const {projectCatalogItem} = require("../utils/projectors");
const {sanitizeCatalogItem, sensitiveEventFieldsEnabled} = require("../utils/catalogSanitizer");
const {readJson, writeJsonAtomic} = require("../utils/storage");
const {WatcherCursor} = require("../utils/watcherCursor");
const {_internals: itemWatcherInternals} = require("./itemWatcher");
const {sendPlayFabRequest} = require("../utils/playfab");
const {compareBinaryChanges} = require("./contentBinaryEvidence");

const DEFAULT_STATE_FILE = path.join(__dirname, "../data/contentUpdateWatcherState.json");

function compactText(value) {
    if (value == null) return "";
    return String(value).trim();
}

function normalizeVersion(value) {
    if (Array.isArray(value)) return value.map(compactText).filter(Boolean).join(".");
    return compactText(value);
}

function normalizeMaxVersion(value) {
    const version = normalizeVersion(value);
    return /^65535(?:\.65535){0,3}$/.test(version) ? "" : version;
}

function contentSize(value) {
    if (value == null || compactText(value) === "") return null;
    const size = Number(value);
    return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

function normalizePackIdentities(item) {
    const identities = item?.DisplayProperties?.packIdentity;
    if (!Array.isArray(identities)) return [];
    return identities.map(entry => ({
        type: compactText(entry?.type).toLowerCase(),
        uuid: compactText(entry?.uuid || entry?.id).toLowerCase(),
        version: normalizeVersion(entry?.version)
    })).filter(entry => entry.type || entry.uuid || entry.version).sort((a, b) => `${a.type}|${a.uuid}`.localeCompare(`${b.type}|${b.uuid}`));
}

function contentUrlIdentity(value) {
    const raw = compactText(value);
    if (!raw) return {urlHost: "", urlFingerprint: ""};
    try {
        const parsed = new URL(raw);
        const legacyCanonical = `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname}`;
        const host = parsed.host.toLowerCase().replace(/^content\d+\.prod\.catalog\.playfab\.com$/, "content.prod.catalog.playfab.com");
        const canonical = `${parsed.protocol.toLowerCase()}//${host}${parsed.pathname}`;
        return {urlHost: parsed.hostname.toLowerCase(), urlFingerprint: stableHash(canonical), legacyUrlFingerprint: stableHash(legacyCanonical)};
    } catch {
        const canonical = raw.split(/[?#]/, 1)[0];
        return {urlHost: "", urlFingerprint: stableHash(canonical)};
    }
}

function eventExposureOptions(env = process.env) {
    return {exposeSensitive: sensitiveEventFieldsEnabled(env)};
}

function normalizeContentVariants(item, options = {}) {
    const contents = Array.isArray(item?.Contents) ? item.Contents : Array.isArray(item?.contents) ? item.contents : [];
    return contents.map(entry => {
        const rawUrl = compactText(entry?.Url || entry?.url);
        const urlIdentity = contentUrlIdentity(rawUrl);
        return {
            id: compactText(entry?.Id || entry?.id).toLowerCase(),
            url: options.exposeSensitive === true ? rawUrl : null,
            ...urlIdentity,
            type: compactText(entry?.Type || entry?.type).toLowerCase(),
            minClientVersion: normalizeVersion(entry?.MinClientVersion || entry?.minClientVersion),
            maxClientVersion: normalizeMaxVersion(entry?.MaxClientVersion ?? entry?.maxClientVersion),
            tags: Array.from(new Set((Array.isArray(entry?.Tags) ? entry.Tags : Array.isArray(entry?.tags) ? entry.tags : []).map(compactText).filter(Boolean))).sort((a, b) => a.localeCompare(b))
        };
    }).filter(entry => entry.id || entry.urlFingerprint || entry.type || entry.minClientVersion || entry.maxClientVersion || entry.tags.length)
        .sort((a, b) => `${a.id}|${a.type}|${a.urlFingerprint}|${a.minClientVersion}|${a.maxClientVersion}|${a.tags.join(",")}`.localeCompare(`${b.id}|${b.type}|${b.urlFingerprint}|${b.minClientVersion}|${b.maxClientVersion}|${b.tags.join(",")}`));
}

function contentRevisionOf(item, options = eventExposureOptions()) {
    const display = item?.DisplayProperties || {};
    return {
        packs: normalizePackIdentities(item),
        variants: normalizeContentVariants(item, options),
        gameVersion: normalizeVersion(display.lastUpdated),
        minClientVersion: normalizeVersion(display.minClientVersion),
        maxClientVersion: normalizeMaxVersion(display.maxClientVersion),
        totalContentFileSize: contentSize(display.totalContentFileSize)
    };
}

function contentRevisionIdentity(revision) {
    if (!revision || typeof revision !== "object") return revision;
    return {
        ...revision,
        variants: (revision.variants || []).map(contentVariantIdentity)
    };
}

function contentVariantIdentity(variant) {
    if (!variant || typeof variant !== "object") return variant;
    const {url: _url, urlHost: _host, legacyUrlFingerprint: _legacy, ...identity} = variant;
    return identity;
}

function contentRevisionHash(item, options = eventExposureOptions()) {
    return stableHash(contentRevisionIdentity(contentRevisionOf(item, options)));
}

function normalizeStoredRevision(revision, options = eventExposureOptions()) {
    if (!revision || typeof revision !== "object") return null;
    return {
        ...revision,
        maxClientVersion: normalizeMaxVersion(revision.maxClientVersion),
        variants: (revision.variants || []).map(variant => ({
            ...variant,
            maxClientVersion: normalizeMaxVersion(variant.maxClientVersion),
            tags: Array.from(new Set(variant.tags || [])).sort((a, b) => a.localeCompare(b)),
            url: options.exposeSensitive === true ? compactText(variant?.url) : null
        }))
    };
}

function indexBy(values, keyOf) {
    return new Map((values || []).map(value => [keyOf(value), value]));
}

function diffContentRevisions(before, after) {
    const changes = [];
    const compareList = (kind, previous, current, keyOf, identityOf = value => value) => {
        const previousByKey = indexBy(previous, keyOf);
        const currentByKey = indexBy(current, keyOf);
        const keys = new Set([...previousByKey.keys(), ...currentByKey.keys()]);
        for (const key of keys) {
            const oldValue = previousByKey.get(key) || null;
            const newValue = currentByKey.get(key) || null;
            if (stableHash(identityOf(oldValue)) === stableHash(identityOf(newValue))) continue;
            changes.push({kind, key, before: oldValue, after: newValue});
        }
    };

    compareList("pack", before.packs, after.packs, value => value.uuid || value.type);
    const previousVariants = [...(before.variants || [])];
    const currentVariants = [...(after.variants || [])];
    const slotOf = value => stableHash({type: value.type, min: value.minClientVersion, max: value.maxClientVersion, tags: value.tags});
    const pairs = [];
    for (let i = previousVariants.length - 1; i >= 0; i--) {
        const old = previousVariants[i];
        if (!old.id) continue;
        const j = currentVariants.findIndex(value => value.id === old.id);
        if (j < 0) continue;
        pairs.push([old, currentVariants.splice(j, 1)[0]]);
        previousVariants.splice(i, 1);
    }
    for (let i = previousVariants.length - 1; i >= 0; i--) {
        const old = previousVariants[i];
        const j = currentVariants.findIndex(value => stableHash(contentVariantIdentity(old)) === stableHash(contentVariantIdentity(value)));
        if (j < 0) continue;
        pairs.push([old, currentVariants.splice(j, 1)[0]]);
        previousVariants.splice(i, 1);
    }
    for (let i = previousVariants.length - 1; i >= 0; i--) {
        const old = previousVariants[i];
        const slot = slotOf(old);
        const matches = currentVariants.filter(value => slotOf(value) === slot);
        if (matches.length !== 1 || previousVariants.filter(value => slotOf(value) === slot).length !== 1) continue;
        pairs.push([old, currentVariants.splice(currentVariants.indexOf(matches[0]), 1)[0]]);
        previousVariants.splice(i, 1);
    }
    pairs.push(...previousVariants.map(value => [value, null]), ...currentVariants.map(value => [null, value]));
    for (const [oldValue, newValue] of pairs) {
        const oldIdentity = contentVariantIdentity(oldValue);
        const newIdentity = contentVariantIdentity(newValue);
        if (oldIdentity && newIdentity && oldValue.legacyUrlFingerprint === undefined
            && oldValue.urlFingerprint === newValue.legacyUrlFingerprint) {
            oldIdentity.urlFingerprint = newIdentity.urlFingerprint;
        }
        if (stableHash(oldIdentity) === stableHash(newIdentity)) continue;
        changes.push({kind: "content", key: newValue?.id || oldValue?.id || slotOf(newValue || oldValue), before: oldValue, after: newValue});
    }
    for (const field of ["gameVersion", "minClientVersion", "maxClientVersion", "totalContentFileSize"]) {
        if (before[field] !== after[field]) changes.push({kind: "property", key: field, before: before[field], after: after[field]});
    }
    return changes;
}

function diffRevision(beforeItem, afterItem, options = eventExposureOptions()) {
    return diffContentRevisions(contentRevisionOf(beforeItem, options), contentRevisionOf(afterItem, options));
}

function stateFilePath() {
    return process.env.CONTENT_UPDATE_WATCH_STATE_FILE || DEFAULT_STATE_FILE;
}

function normalizePending(pending, options) {
    if (!pending?.snapshot?.revision || !pending.snapshot.item) return undefined;
    const revision = normalizeStoredRevision(pending.snapshot.revision, options);
    return {
        firstSeenAt: pending.firstSeenAt,
        stableSince: pending.stableSince,
        snapshot: {
            revision,
            hash: stableHash(contentRevisionIdentity(revision)),
            item: sanitizeCatalogItem(pending.snapshot.item, options)
        }
    };
}

function normalizeRelease(release, options) {
    if (!release?.base?.revision || !release.base.item) return undefined;
    return {...sanitizeCatalogItem(release, options), base: {
        item: sanitizeCatalogItem(release.base.item, options),
        revision: normalizeStoredRevision(release.base.revision, options)
    }};
}

function serializeState(state, options = eventExposureOptions()) {
    return Array.from(state.entries()).map(([id, entry]) => {
        const sourceItem = entry.item || entry.raw || null;
        const revision = normalizeStoredRevision(entry.revision, options)
            || (sourceItem ? contentRevisionOf(sourceItem, options) : null);
        return {
            id,
            hash: revision ? stableHash(contentRevisionIdentity(revision)) : entry.hash,
            revision,
            item: sanitizeCatalogItem(sourceItem, options),
            observedModifiedAt: entry.observedModifiedAt,
            pending: normalizePending(entry.pending, options),
            release: normalizeRelease(entry.release, options)
        };
    }).filter(entry => entry.id && entry.hash);
}

function deserializeState(entries, options = eventExposureOptions()) {
    const state = new Map();
    if (!Array.isArray(entries)) return state;
    for (const entry of entries) {
        const sourceItem = entry?.item || entry?.raw || null;
        const id = entry?.id || sourceItem?.Id || sourceItem?.id;
        const revision = normalizeStoredRevision(entry?.revision, options) || (sourceItem ? contentRevisionOf(sourceItem, options) : null);
        if (!id || !revision) continue;
        state.set(id, {
            hash: stableHash(contentRevisionIdentity(revision)),
            revision,
            item: sanitizeCatalogItem(sourceItem, options),
            observedModifiedAt: entry.observedModifiedAt,
            pending: normalizePending(entry.pending, options),
            release: normalizeRelease(entry.release, options)
        });
    }
    return state;
}

function snapshotContentItem(item, options = eventExposureOptions()) {
    const revision = contentRevisionOf(item, options);
    return {
        hash: stableHash(contentRevisionIdentity(revision)),
        revision,
        item: sanitizeCatalogItem(item, options)
    };
}

function prepareContentSnapshot(previous, current, options) {
    const snapshot = snapshotContentItem(current, options);
    if (!previous) return snapshot;
    const known = normalizeStoredRevision(previous.revision, options) || contentRevisionOf(previous.item || previous.raw, options);
    const knownItem = previous.item || previous.raw || {};
    const display = current.DisplayProperties || {};
    const mergedDisplay = {...knownItem.DisplayProperties, ...display};
    const preserve = (key, field, valid) => {
        if (valid) return;
        snapshot.revision[key] = known[key];
        if (knownItem.DisplayProperties?.[field] !== undefined) mergedDisplay[field] = knownItem.DisplayProperties[field];
    };
    preserve("packs", "packIdentity", Array.isArray(display.packIdentity));
    if (Array.isArray(display.packIdentity)) {
        for (const pack of snapshot.revision.packs) {
            const old = known.packs.find(value => pack.uuid && value.uuid === pack.uuid);
            const raw = display.packIdentity.find(value => compactText(value.uuid || value.id).toLowerCase() === pack.uuid);
            if (!old || !raw) continue;
            if (raw.version == null) pack.version = old.version;
            if (raw.type == null) pack.type = old.type;
        }
        mergedDisplay.packIdentity = snapshot.revision.packs;
    }
    for (const [key, field] of [["gameVersion", "lastUpdated"], ["minClientVersion", "minClientVersion"], ["maxClientVersion", "maxClientVersion"]]) {
        preserve(key, field, display[field] != null);
    }
    preserve("totalContentFileSize", "totalContentFileSize", contentSize(display.totalContentFileSize) !== null);
    snapshot.item = {...sanitizeCatalogItem(knownItem, options), ...snapshot.item, DisplayProperties: mergedDisplay};
    if (!Array.isArray(current.Contents) && !Array.isArray(current.contents)) {
        snapshot.revision.variants = known.variants;
        if (knownItem.Contents !== undefined) snapshot.item.Contents = knownItem.Contents;
        if (knownItem.contents !== undefined) snapshot.item.contents = knownItem.contents;
    } else {
        const rawVariants = current.Contents || current.contents;
        for (const variant of snapshot.revision.variants) {
            const old = known.variants.find(value => value.id && value.id === variant.id);
            const raw = rawVariants.find(value => compactText(value.Id || value.id).toLowerCase() === variant.id);
            if (old && raw) {
                for (const [key, upper, lower] of [["type", "Type", "type"], ["minClientVersion", "MinClientVersion", "minClientVersion"], ["maxClientVersion", "MaxClientVersion", "maxClientVersion"], ["tags", "Tags", "tags"]]) {
                    if (raw[upper] == null && raw[lower] == null) variant[key] = old[key];
                }
                if (old.legacyUrlFingerprint === undefined && /^content\d+\.prod\.catalog\.playfab\.com$/.test(old.urlHost)) {
                    try {
                        const parsed = new URL(raw.Url || raw.url);
                        if (/^content\d+\.prod\.catalog\.playfab\.com$/.test(parsed.host)) {
                            const oldRoute = `${parsed.protocol.toLowerCase()}//${old.urlHost}${parsed.pathname}`;
                            if (stableHash(oldRoute) === old.urlFingerprint) variant.legacyUrlFingerprint = old.urlFingerprint;
                        }
                    } catch {}
                }
                const contentsKey = Array.isArray(snapshot.item.Contents) ? "Contents" : "contents";
                snapshot.item[contentsKey] = snapshot.item[contentsKey].map(entry => compactText(entry.Id || entry.id).toLowerCase() !== variant.id ? entry : {
                    ...entry, Type: variant.type, MinClientVersion: variant.minClientVersion, MaxClientVersion: variant.maxClientVersion, Tags: variant.tags
                });
            }
            if (!variant.urlFingerprint && old?.urlFingerprint) {
                variant.urlFingerprint = old.urlFingerprint;
                variant.urlHost = old.urlHost;
                variant.legacyUrlFingerprint = old.legacyUrlFingerprint;
            }
        }
    }
    snapshot.item = sanitizeCatalogItem(snapshot.item, options);
    snapshot.hash = stableHash(contentRevisionIdentity(snapshot.revision));
    return snapshot;
}

function loadPersistedState() {
    try {
        const filePath = stateFilePath();
        if (!fs.existsSync(filePath)) return {state: new Map(), loaded: false};
        return {state: deserializeState(readJson(filePath, [])), loaded: true};
    } catch (err) {
        logger.warn(`[ContentUpdateWatcher] failed to load state file: ${err.message}`);
        throw err;
    }
}

function savePersistedState(state) {
    try {
        writeJsonAtomic(stateFilePath(), serializeState(state));
    } catch (err) {
        logger.warn(`[ContentUpdateWatcher] failed to save state file: ${err.message}`);
        throw err;
    }
}

function buildContentUpdate(previous, current, options = eventExposureOptions()) {
    if (!previous || !current) return null;
    const currentSnapshot = prepareContentSnapshot(previous, current, options);
    const hash = currentSnapshot.hash;
    if (previous.hash === hash) return null;
    const previousRevision = normalizeStoredRevision(previous.revision, options)
        || contentRevisionOf(previous.item || previous.raw, options);
    const changes = diffContentRevisions(previousRevision, currentSnapshot.revision);
    if (!changes.length) return null;
    return {
        id: current.Id || current.id,
        before: sanitizeCatalogItem(previous.item || previous.raw, options),
        after: currentSnapshot.item,
        changes,
        hash
    };
}

function modificationTime(item) {
    return Date.parse(item?.LastModifiedDate || item?.lastModifiedDate || "") || 0;
}

function hasImmediateSignal(changes) {
    return changes.some(change => {
        if (change.kind === "pack") return change.after !== null;
        if (change.kind === "property") return change.key !== "totalContentFileSize";
        if (change.kind !== "content" || !change.after) return false;
        if (!change.before) return true;
        return ["id", "urlFingerprint", "type", "minClientVersion", "maxClientVersion"].some(key => change.before[key] !== change.after[key]);
    });
}

function canConfirmChanges(current, changes) {
    const display = current.DisplayProperties || {};
    const fields = {gameVersion: "lastUpdated", minClientVersion: "minClientVersion", maxClientVersion: "maxClientVersion", totalContentFileSize: "totalContentFileSize"};
    return changes.every(change => {
        if (change.kind === "pack") {
            if (!Array.isArray(display.packIdentity) || (!Array.isArray(current.Contents) && !Array.isArray(current.contents))) return false;
            if (!change.before || !change.after) return true;
            const raw = display.packIdentity.find(value => compactText(value.uuid || value.id).toLowerCase() === change.after.uuid);
            return !!raw && (change.before.version === change.after.version || raw.version != null)
                && (change.before.type === change.after.type || raw.type != null);
        }
        if (change.kind === "content") {
            const contents = Array.isArray(current.Contents) ? current.Contents : current.contents;
            if (!Array.isArray(contents)) return false;
            if (!change.before || !change.after) return true;
            const raw = contents.find(value => compactText(value.Id || value.id).toLowerCase() === change.after.id);
            if (!raw) return false;
            for (const [key, upper, lower] of [["type", "Type", "type"], ["minClientVersion", "MinClientVersion", "minClientVersion"], ["maxClientVersion", "MaxClientVersion", "maxClientVersion"], ["tags", "Tags", "tags"]]) {
                if (stableHash(change.before[key]) !== stableHash(change.after[key]) && raw[upper] == null && raw[lower] == null) return false;
            }
            return true;
        }
        return change.key === "totalContentFileSize" ? contentSize(display.totalContentFileSize) !== null : display[fields[change.key]] != null;
    });
}

function observeContentItem(previous, current, settings = {}) {
    const options = settings.exposure || eventExposureOptions();
    const now = settings.now ?? Date.now();
    const confirmMs = settings.confirmMs ?? 30000;
    const maxPendingMs = settings.maxPendingMs ?? 120000;
    if (!previous) return {entry: snapshotContentItem(current, options), updates: []};
    const currentTime = modificationTime(current);
    const lastTime = Math.max(previous.observedModifiedAt || 0, modificationTime(previous.item || previous.raw), modificationTime(previous.pending?.snapshot?.item));
    if (currentTime && lastTime && currentTime < lastTime) return {entry: previous, updates: []};
    const snapshot = prepareContentSnapshot(previous, current, options);
    const update = buildContentUpdate(previous, current, options);
    const observedModifiedAt = Math.max(lastTime, currentTime);
    if (!update) {
        if (previous.pending && !canConfirmChanges(current, diffContentRevisions(previous.revision, previous.pending.snapshot.revision))) {
            return {entry: {...previous, observedModifiedAt}, updates: []};
        }
        return {entry: {...snapshot, observedModifiedAt}, updates: []};
    }
    const pending = previous.pending;
    const stable = pending?.snapshot.hash === snapshot.hash;
    const firstSeenAt = pending?.firstSeenAt ?? now;
    const stableSince = stable ? pending.stableSince : now;
    const confirmable = canConfirmChanges(current, update.changes);
    const immediate = hasImmediateSignal(update.changes);
    if (confirmable && (immediate || (stable && now - stableSince >= confirmMs) || (pending && now - firstSeenAt >= maxPendingMs))) {
        update.detection = {mode: immediate ? "immediate" : stable ? "confirmed" : "bounded-wait", reasons: [...new Set(update.changes.map(change => change.kind === "property" ? change.key : change.kind))]};
        return {entry: {...snapshot, observedModifiedAt}, updates: [update]};
    }
    return {entry: {...previous, observedModifiedAt, pending: {firstSeenAt, stableSince, snapshot}}, updates: []};
}

async function refreshPendingItems(state, titleId, os, load = sendPlayFabRequest) {
    const ids = [...state].filter(([, entry]) => entry.pending).map(([id]) => id);
    const items = [];
    for (let offset = 0; offset < ids.length; offset += 5) {
        const batchIds = ids.slice(offset, offset + 5);
        const batch = await Promise.allSettled(batchIds.map(async id => {
            const response = await load(titleId, "Catalog/GetItem", {Id: id}, "X-EntityToken", 3, os, {priority: "background"});
            const item = response.Item || response.item;
            if (!item || (item.Id || item.id) !== id) throw new Error(`Missing pending content item ${id}`);
            return {...item, __catalogComplete: true};
        }));
        for (let index = 0; index < batch.length; index++) {
            const result = batch[index];
            if (result.status === "fulfilled") items.push(result.value);
            else logger.warn(`[ContentUpdateWatcher] confirmation failed for ${batchIds[index]}; pending change retained for retry`);
        }
    }
    return items;
}

async function scanContentItems(state, changed, titleId, os, settings = {}) {
    const refreshed = await refreshPendingItems(state, titleId, os, settings.load);
    const pendingIds = new Set([...state].filter(([, entry]) => entry.pending).map(([id]) => id));
    const nextState = new Map(state);
    const updates = [];
    const observations = [];
    let published = 0, recorded = 0;
    const flush = async () => {
        if (!settings.publish || (updates.length === published && observations.length === recorded)) return;
        await settings.publish(updates.slice(published), observations.slice(recorded));
        published = updates.length;
        recorded = observations.length;
    };
    const candidates = [...changed.filter(value => !pendingIds.has(value.Id || value.id)), ...refreshed].map(item => {
        const previous = state.get(item.Id || item.id);
        const changes = previous ? diffContentRevisions(previous.revision, prepareContentSnapshot(previous, item, eventExposureOptions()).revision) : [];
        return {item, priority: changes.some(change => change.kind === "pack" && change.after || change.kind === "property" && change.key !== "totalContentFileSize") ? 0 : 1};
    }).sort((a, b) => a.priority - b.priority);
    for (const {item} of candidates) {
        const id = item.Id || item.id;
        if (!id) continue;
        const previous = nextState.get(id);
        let result = observeContentItem(previous, item, settings);
        let verification;
        const snapshot = prepareContentSnapshot(previous, item, settings.exposure || eventExposureOptions());
        const changes = previous ? diffContentRevisions(previous.revision, snapshot.revision) : [];
        const binaryOnly = changes.some(change => change.kind === "content") && changes.every(change => {
            if (change.kind === "property") return change.key === "totalContentFileSize";
            return change.kind === "content" && change.before && change.after
                && ["type", "minClientVersion", "maxClientVersion", "tags"].every(key => stableHash(change.before[key]) === stableHash(change.after[key]));
        });
        if (result.updates.length && binaryOnly) {
            await flush();
            verification = await (settings.verify || compareBinaryChanges)(changes, item);
            result.updates[0].verification = verification;
        }
        result = groupContentRelease(previous, result, settings.now ?? Date.now());
        nextState.set(id, result.entry);
        updates.push(...result.updates);
        const observedHash = previous?.pending?.snapshot.hash || previous?.hash;
        if (snapshot.hash !== observedHash || result.updates.length) {
            observations.push({id, at: settings.now ?? Date.now(), beforeHash: observedHash || null, afterHash: snapshot.hash,
                action: verification?.status === "identical" ? "verified-repack" : result.updates[0]?.release.action || (result.entry === previous ? "stale" : result.entry.pending ? "pending" : previous?.pending ? "reverted" : previous ? "normalized" : "baseline"),
                releaseId: result.entry.release?.id || null, downloadSize: snapshot.revision.totalContentFileSize, changes, verification});
        }
    }
    await flush();
    return {state: nextState, updates, observations};
}

const WINDOW_MS = 20 * 60000;
const MAX_RELEASE_MS = 2 * 3600000;

function summarizeChanges(changes) {
    return changes.map(change => {
        if (change.kind === "property") {
            return {kind: change.kind, key: change.key, before: change.before, after: change.after};
        }
        const summarize = value => value && {
            id: value.id || value.uuid,
            type: value.type,
            version: value.version,
            minClientVersion: value.minClientVersion,
            maxClientVersion: value.maxClientVersion,
            tags: value.tags,
            urlFingerprint: value.urlFingerprint
        };
        return {kind: change.kind, key: change.key, before: summarize(change.before), after: summarize(change.after)};
    });
}

function groupContentRelease(previous, outcome, now) {
    if (!outcome.updates.length) return {...outcome, entry: {...outcome.entry, release: previous?.release}};
    const update = outcome.updates[0];
    const packs = stableHash(outcome.entry.revision.packs);
    const active = previous?.release;
    const sameRelease = active && active.packs === packs
        && now - active.lastChangedAt <= WINDOW_MS && now - active.startedAt <= MAX_RELEASE_MS;
    const base = sameRelease ? active.base : {item: update.before, revision: previous.revision};
    const sequence = sameRelease ? active.sequence + 1 : 1;
    const transition = stableHash(previous.revision.packs) !== packs ? {packs} : {
        after: update.hash,
        modified: update.after.LastModifiedDate || update.after.lastModifiedDate || null
    };
    const observation = {
        sequence,
        at: now,
        downloadSize: outcome.entry.revision.totalContentFileSize,
        changes: summarizeChanges(update.changes),
        verification: update.verification?.status || "not-required"
    };
    const release = {
        id: sameRelease ? active.id : stableHash({
            id: update.id, previousRelease: active?.id || null, before: previous.hash, ...transition
        }),
        packs,
        base,
        sequence,
        startedAt: sameRelease ? active.startedAt : now,
        lastChangedAt: now,
        observations: [...(sameRelease ? active.observations : []), observation].slice(-40),
        baseHash: stableHash(contentRevisionIdentity(base.revision))
    };
    const grouped = {
        ...update,
        release: {
            id: release.id,
            sequence,
            action: sameRelease ? "amend" : "new",
            startedAt: release.startedAt,
            lastChangedAt: now,
            revision: outcome.entry.hash,
            observations: release.observations,
            before: projectCatalogItem(base.item),
            changes: diffContentRevisions(base.revision, outcome.entry.revision)
        }
    };
    return {entry: {...outcome.entry, release}, updates: [grouped]};
}

class ContentObservationJournal {
    constructor(file) {
        this.file = file;
    }

    read() {
        return readJson(this.file, []);
    }

    append(observations) {
        if (!observations.length) return;
        const safe = observations.map(observation => ({
            ...sanitizeCatalogItem(observation, {exposeSensitive: false}),
            changes: summarizeChanges(observation.changes || [])
        }));
        const next = [...this.read(), ...safe];
        let bytes = Buffer.byteLength(JSON.stringify(next));
        let start = 0;
        while (start < next.length && (next.length - start > 100000 || bytes > 32 * 1024 * 1024)) {
            bytes -= Buffer.byteLength(JSON.stringify(next[start++])) + 1;
        }
        writeJsonAtomic(this.file, next.slice(start));
    }
}

class ContentUpdateWatcher {
    constructor() {
        this.running = false;
        this.timer = null;
        this.state = new Map();
        this.lastRunTs = 0;
        this.bootstrapped = false;
    }

    start(eventBus) {
        if (this.running) return;
        this.running = true;
        const os = process.env.OS || "iOS";
        const intervalMs = Math.max(10000, parseInt(process.env.CONTENT_UPDATE_WATCH_INTERVAL_MS || "30000", 10));
        const itemsPerRequest = Math.max(10, parseInt(process.env.CONTENT_UPDATE_WATCH_ITEMS_PER_REQUEST || "200", 10));
        const maxItems = Math.max(itemsPerRequest, parseInt(process.env.CONTENT_UPDATE_WATCH_MAX_ITEMS || "10000", 10));
        const cursor = new WatcherCursor(`${stateFilePath()}.cursor.json`);
        const overlapMs = Math.max(cursor.overlapMs, parseInt(process.env.CONTENT_UPDATE_WATCH_OVERLAP_MS || "0", 10));
        const confirmMs = Math.max(intervalMs, 30000);
        const maxPendingMs = Math.max(confirmMs, 120000);
        const observationJournal = new ContentObservationJournal(path.join(__dirname, "../data/catalog-index/content-update-observations.json"));

        const run = async () => {
            const scanStartedAt = Date.now();
            const window = cursor.window(scanStartedAt, overlapMs);
            const titleId = itemWatcherInternals.getTitleId();
            const persisted = this.bootstrapped ? {state: this.state, loaded: true} : loadPersistedState();
            const sinceIso = new Date(window.since).toISOString();
            const changed = persisted.loaded
                ? await itemWatcherInternals.requestChangedItems(titleId, os, sinceIso, itemsPerRequest, maxItems, sinceIso)
                : await itemWatcherInternals.fetchBootstrapItems(titleId, os, itemsPerRequest, maxItems, 0);
            const result = await scanContentItems(persisted.state, changed, titleId, os, {now: scanStartedAt, confirmMs, maxPendingMs,
                publish: (updates, observations) => {
                    observationJournal.append(observations);
                    this.emitUpdates(eventBus, updates);
                }});
            savePersistedState(result.state);
            cursor.commit(scanStartedAt, window);
            this.state = result.state;
            this.lastRunTs = scanStartedAt;
            this.bootstrapped = true;
        };

        const runOnce = createNonOverlappingRunner({
            status: this,
            run,
            onError: err => logger.error(`[ContentUpdateWatcher] run failed: ${err.stack || err.message}`),
            onSkip: () => logger.debug("[ContentUpdateWatcher] previous run still in progress; skipping tick")
        });
        runOnce();
        this.timer = setInterval(runOnce, intervalMs);
    }

    emitUpdates(eventBus, updates) {
        if (!updates.length) return;
        eventBus.emit("item.content.updated", {
            ts: Date.now(),
            count: updates.length,
            items: updates.map(update => ({
                id: update.id,
                before: projectCatalogItem(update.before),
                after: projectCatalogItem(update.after),
                changes: update.changes,
                detection: update.detection,
                release: update.release,
                verification: update.verification
            }))
        });
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}

const contentUpdateWatcher = new ContentUpdateWatcher();
module.exports = {
    contentUpdateWatcher,
    _internals: {
        groupContentRelease,
        ContentObservationJournal,
        normalizePackIdentities,
        normalizeContentVariants,
        contentUrlIdentity,
        eventExposureOptions,
        contentRevisionOf,
        contentRevisionIdentity,
        contentRevisionHash,
        normalizeStoredRevision,
        diffContentRevisions,
        diffRevision,
        buildContentUpdate,
        observeContentItem,
        refreshPendingItems,
        scanContentItems,
        snapshotContentItem,
        serializeState,
        deserializeState
    }
};
