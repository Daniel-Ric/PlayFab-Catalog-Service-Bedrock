// -----------------------------------------------------------------------------
//
// File: src/services/contentBinaryEvidence.js
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

const {createHash} = require("node:crypto");
const {inflateRaw} = require("node:zlib");
const {promisify} = require("node:util");
const axios = require("axios");
const inflate = promisify(inflateRaw);
const hash = value => createHash("sha256").update(value).digest("hex");
const MAX_DOWNLOAD = 128 * 1024 * 1024;
const MAX_EXPANDED = 256 * 1024 * 1024;
const crcTable = Array.from({length: 256}, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    return value >>> 0;
});
function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
    return (value ^ 0xffffffff) >>> 0;
}

function safeUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port
            && /^content\d+\.prod\.catalog\.playfab\.com$/.test(parsed.hostname) ? parsed : null;
    } catch {
        return null;
    }
}

async function fingerprintBinary(input, limits = {}, budget, depth = 0) {
    const bytes = Buffer.from(input);
    const maxExpandedBytes = limits.maxExpandedBytes ?? MAX_EXPANDED;
    if (bytes.length > (limits.maxDownloadBytes ?? MAX_DOWNLOAD)) throw new Error("Binary download limit exceeded");
    const archiveHash = hash(bytes);
    if (bytes.length < 4 || (bytes.readUInt32LE(0) !== 0x04034b50 && bytes.readUInt32LE(0) !== 0x06054b50)) {
        return {archiveHash, contentHash: archiveHash, bytes: bytes.length, format: "binary"};
    }
    budget ||= {expanded: 0, entries: 0};
    let end = -1;
    for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index--) {
        if (bytes.readUInt32LE(index) === 0x06054b50 && index + 22 + bytes.readUInt16LE(index + 20) === bytes.length) {
            end = index;
            break;
        }
    }
    if (end < 0) throw new Error("Invalid ZIP directory");
    const count = bytes.readUInt16LE(end + 10);
    const directorySize = bytes.readUInt32LE(end + 12);
    const directoryOffset = bytes.readUInt32LE(end + 16);
    if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count
        || count === 65535 || directoryOffset + directorySize !== end) throw new Error("Unsupported ZIP directory");
    const names = new Set();
    const files = [];
    let cursor = directoryOffset;
    for (let index = 0; index < count; index++) {
        if (++budget.entries > 20000 || cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP entry");
        const flags = bytes.readUInt16LE(cursor + 8);
        const method = bytes.readUInt16LE(cursor + 10);
        const crc = bytes.readUInt32LE(cursor + 16);
        const compressedSize = bytes.readUInt32LE(cursor + 20);
        const expandedSize = bytes.readUInt32LE(cursor + 24);
        const nameSize = bytes.readUInt16LE(cursor + 28);
        const extraSize = bytes.readUInt16LE(cursor + 30);
        const commentSize = bytes.readUInt16LE(cursor + 32);
        const localOffset = bytes.readUInt32LE(cursor + 42);
        const next = cursor + 46 + nameSize + extraSize + commentSize;
        if (next > end || flags & 1 || ![0, 8].includes(method) || compressedSize === 0xffffffff || expandedSize === 0xffffffff
            || localOffset + 30 > directoryOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Unsupported ZIP entry");
        const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameSize);
        const name = nameBytes.toString("hex");
        const localFlags = bytes.readUInt16LE(localOffset + 6);
        const localMethod = bytes.readUInt16LE(localOffset + 8);
        const localNameSize = bytes.readUInt16LE(localOffset + 26);
        const dataOffset = localOffset + 30 + localNameSize + bytes.readUInt16LE(localOffset + 28);
        if (names.has(name) || localFlags !== flags || localMethod !== method || !nameBytes.equals(bytes.subarray(localOffset + 30, localOffset + 30 + localNameSize))
            || dataOffset + compressedSize > directoryOffset) throw new Error("Inconsistent ZIP entry");
        if (!(flags & 8) && (bytes.readUInt32LE(localOffset + 14) !== crc || bytes.readUInt32LE(localOffset + 18) !== compressedSize
            || bytes.readUInt32LE(localOffset + 22) !== expandedSize)) throw new Error("Inconsistent ZIP sizes");
        names.add(name);
        budget.expanded += expandedSize;
        if (budget.expanded > maxExpandedBytes) throw new Error("ZIP expansion limit exceeded");
        const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
        const data = method === 8 ? await inflate(compressed, {maxOutputLength: Math.max(1, Math.min(maxExpandedBytes, expandedSize))}) : compressed;
        if (data.length !== expandedSize || crc32(data) !== crc) throw new Error("Invalid ZIP payload");
        if (nameBytes.at(-1) === 47 && data.length) throw new Error("Invalid ZIP directory payload");
        if (nameBytes.at(-1) !== 47) {
            const nested = depth < 2 && data.length >= 4 && [0x04034b50, 0x06054b50].includes(data.readUInt32LE(0));
            const content = nested ? (await fingerprintBinary(data, {...limits, maxDownloadBytes: MAX_EXPANDED}, budget, depth + 1)).contentHash : hash(data);
            files.push([name, content]);
        }
        cursor = next;
    }
    if (cursor !== end) throw new Error("Invalid ZIP directory length");
    files.sort((a, b) => a[0].localeCompare(b[0]));
    return {archiveHash, contentHash: hash(JSON.stringify(files)), bytes: bytes.length, files: files.length, format: "zip"};
}

async function downloadBinary(url, {signal} = {}) {
    if (!safeUrl(url)) throw new Error("Unsupported binary origin");
    const response = await axios.get(url, {responseType: "arraybuffer", timeout: 15000, maxContentLength: MAX_DOWNLOAD,
        maxBodyLength: MAX_DOWNLOAD, maxRedirects: 0, signal, headers: {Accept: "application/octet-stream"}});
    return Buffer.from(response.data);
}

function previousUrl(change, currentUrl) {
    const parsed = safeUrl(currentUrl);
    if (!parsed || !change.before?.id || !change.after?.id) return null;
    const segments = parsed.pathname.split("/");
    const indices = segments.map((segment, index) => segment.toLowerCase() === change.after.id.toLowerCase() ? index : -1).filter(index => index >= 0);
    if (indices.length !== 1) return null;
    segments[indices[0]] = change.before.id;
    parsed.pathname = segments.join("/");
    const {contentUrlIdentity} = require("./contentUpdateWatcher")._internals;
    const identity = contentUrlIdentity(parsed.href);
    if (identity.urlFingerprint !== change.before.urlFingerprint && identity.legacyUrlFingerprint !== change.before.urlFingerprint) return null;
    return parsed.href;
}

async function compareBinaryChanges(changes, current, {download = downloadBinary} = {}) {
    const files = changes.filter(change => change.kind === "content");
    if (!files.length || files.length > 4 || files.some(change => !change.before || !change.after)) return {status: "unavailable", files: []};
    const contents = current.Contents || current.contents || [];
    const evidence = [];
    const signal = AbortSignal.timeout(15000);
    try {
        for (const change of files) {
            const entry = contents.find(value => String(value.Id || value.id).toLowerCase() === change.after.id);
            const nextUrl = entry?.Url || entry?.url;
            const oldUrl = previousUrl(change, nextUrl);
            if (!safeUrl(nextUrl) || !oldUrl || oldUrl === nextUrl) return {status: "unavailable", files: evidence};
            signal.throwIfAborted();
            const before = await fingerprintBinary(await download(oldUrl, {signal}));
            signal.throwIfAborted();
            const after = await fingerprintBinary(await download(nextUrl, {signal}));
            signal.throwIfAborted();
            evidence.push({beforeId: change.before.id, afterId: change.after.id, before, after});
        }
        return {status: evidence.every(file => file.before.contentHash === file.after.contentHash) ? "identical" : "changed", files: evidence};
    } catch {
        return {status: "unavailable", files: evidence};
    }
}

module.exports = {fingerprintBinary, compareBinaryChanges};
