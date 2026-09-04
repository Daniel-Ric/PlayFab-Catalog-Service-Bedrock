// -----------------------------------------------------------------------------
//
// File: src/services/playfabUpstreamGuard.js
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

const Bottleneck = require("bottleneck");

const PRIORITIES = Object.freeze({interactive: 3, default: 5, background: 8});
const DEFAULT_POLICY = Object.freeze({maxConcurrent: 8, minTime: 0});
const SEARCH_ITEMS_POLICY = Object.freeze({maxConcurrent: 1, minTime: 600});
const GET_ITEMS_POLICY = Object.freeze({maxConcurrent: 4, minTime: 50});
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 15000;

function resolvePriority(value) {
    if (typeof value === "string" && Object.hasOwn(PRIORITIES, value)) return PRIORITIES[value];
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(9, Math.floor(numeric))) : PRIORITIES.default;
}

function endpointPolicy(endpoint) {
    const name = String(endpoint || "").toLowerCase();
    if (name === "catalog/searchitems") return {...SEARCH_ITEMS_POLICY};
    if (name === "catalog/getitem" || name === "catalog/getitems") return {...GET_ITEMS_POLICY};
    return {...DEFAULT_POLICY};
}

function circuitOpenError(openUntil) {
    const error = new Error("PlayFab upstream circuit is open.");
    error.status = 503;
    error.code = "PLAYFAB_CIRCUIT_OPEN";
    error.retryable = false;
    error.publicMessage = "PlayFab upstream is temporarily unavailable.";
    error.openUntil = openUntil;
    return error;
}

function createUpstreamGuard(options = {}) {
    const entries = new Map();
    const clock = options.now || Date.now;
    const policyResolver = options.policyResolver || endpointPolicy;
    const threshold = Math.max(1, Number(options.threshold ?? CIRCUIT_FAILURE_THRESHOLD));
    const openMs = Math.max(1000, Number(options.openMs ?? CIRCUIT_OPEN_MS));
    const BottleneckClass = options.BottleneckClass || Bottleneck;

    function getEntry(titleId, endpoint) {
        const key = `${titleId}:${endpoint}`;
        let entry = entries.get(key);
        if (entry) return entry;
        const policy = policyResolver(endpoint);
        entry = {
            key,
            titleId,
            endpoint,
            policy,
            limiter: new BottleneckClass(policy),
            circuit: {failures: 0, openUntil: 0, halfOpen: false},
            metrics: {scheduled: 0, started: 0, succeeded: 0, failed: 0, throttled: 0, circuitRejected: 0}
        };
        entries.set(key, entry);
        return entry;
    }

    function rejectCircuit(entry) {
        entry.metrics.circuitRejected += 1;
        throw circuitOpenError(entry.circuit.openUntil);
    }

    function reserve(entry) {
        const now = clock();
        if (entry.circuit.openUntil > now) rejectCircuit(entry);
        if (entry.circuit.openUntil > 0) {
            if (entry.circuit.halfOpen) rejectCircuit(entry);
            entry.circuit.halfOpen = true;
            return true;
        }
        return false;
    }

    function record(entry, status) {
        const code = Number(status) || 0;
        if (code === 429 || code === 503) {
            entry.metrics.throttled += 1;
            entry.circuit.failures += 1;
            entry.circuit.halfOpen = false;
            if (entry.circuit.failures >= threshold) entry.circuit.openUntil = clock() + openMs;
            return;
        }
        entry.circuit.failures = 0;
        entry.circuit.openUntil = 0;
        entry.circuit.halfOpen = false;
    }

    async function schedule(titleId, endpoint, task, scheduleOptions = {}) {
        const entry = getEntry(String(titleId || "unknown"), String(endpoint || "unknown"));
        entry.metrics.scheduled += 1;
        const halfOpenProbe = reserve(entry);
        let started = false;
        try {
            return await entry.limiter.schedule({priority: resolvePriority(scheduleOptions.priority)}, async () => {
                started = true;
                if (!halfOpenProbe && entry.circuit.openUntil > clock()) rejectCircuit(entry);
                entry.metrics.started += 1;
                try {
                    const result = await task();
                    const status = Number(result?.status) || 0;
                    record(entry, status);
                    if (status >= 400) entry.metrics.failed += 1; else entry.metrics.succeeded += 1;
                    return result;
                } catch (error) {
                    if (error?.code !== "PLAYFAB_CIRCUIT_OPEN") {
                        record(entry, error?.status || error?.response?.status);
                        entry.metrics.failed += 1;
                    }
                    throw error;
                }
            });
        } catch (error) {
            if (halfOpenProbe && !started) entry.circuit.halfOpen = false;
            throw error;
        }
    }

    function snapshot() {
        const endpoints = Array.from(entries.values()).map(entry => {
            const counts = typeof entry.limiter.counts === "function" ? entry.limiter.counts() : {};
            return {
                titleId: entry.titleId,
                endpoint: entry.endpoint,
                quota: {
                    ...entry.policy,
                    estimatedRequestsPerMinute: entry.policy.minTime > 0 ? Math.floor(60000 / entry.policy.minTime) : null
                },
                queue: {
                    queued: counts.QUEUED || 0,
                    running: (counts.RUNNING || 0) + (counts.EXECUTING || 0)
                },
                circuit: {
                    state: entry.circuit.openUntil > clock() ? "open" : entry.circuit.openUntil > 0 ? "half_open" : "closed",
                    consecutiveFailures: entry.circuit.failures,
                    openUntil: entry.circuit.openUntil || null
                },
                ...entry.metrics
            };
        });
        const totals = endpoints.reduce((out, entry) => {
            for (const key of ["scheduled", "started", "succeeded", "failed", "throttled", "circuitRejected"]) {
                out[key] += entry[key];
            }
            out.queued += entry.queue.queued;
            out.running += entry.queue.running;
            if (entry.circuit.state !== "closed") out.openCircuits += 1;
            return out;
        }, {scheduled: 0, started: 0, succeeded: 0, failed: 0, throttled: 0, circuitRejected: 0, queued: 0, running: 0, openCircuits: 0});
        return {totals, endpoints};
    }

    return {schedule, snapshot};
}

const upstreamGuard = createUpstreamGuard();

module.exports = {upstreamGuard, createUpstreamGuard, endpointPolicy, resolvePriority};
