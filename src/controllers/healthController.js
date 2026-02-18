// -----------------------------------------------------------------------------
//
// File: src/controllers/healthController.js
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

const os = require("os");
const {dataCache, sessionCache} = require("../config/cache");
const {sendPlayFabRequest, getStoreItems, getSession} = require("../utils/playfab");
const {resolveTitle} = require("../utils/titles");
const {salesWatcher} = require("../services/salesWatcher");
const {itemWatcher} = require("../services/itemWatcher");
const {priceWatcher} = require("../services/priceWatcher");
const {trendingWatcher} = require("../services/trendingWatcher");
const {getConfiguredCorsOrigins} = require("../utils/corsOrigins");

function nowTs() {
    return Date.now();
}

function getPrimaryTitleId() {
    const v = (process.env.FEATURED_PRIMARY_ALIAS || process.env.DEFAULT_ALIAS || "").trim();
    if (v) {
        try {
            const id = resolveTitle(v);
            return String(id);
        } catch {
            if (/^[A-Za-z0-9]{4,10}$/i.test(v)) return v;
        }
    }
    return process.env.TITLE_ID || "20CA2";
}

async function checkUpstream() {
    const titleId = getPrimaryTitleId();
    const osName = process.env.OS || "iOS";

    let catalogSearch = "error";
    let getStore = "error";
    let rateLimited = false;
    let storeCount = 0;
    let sampleStoreId = null;
    let sampleStoreItemCount = 0;

    try {
        const storesResp = await sendPlayFabRequest(titleId, "Catalog/SearchStores", {}, "X-EntityToken", 2, osName);

        const rawStores = storesResp?.Stores || (storesResp?.data ? storesResp.data.Stores : []) || [];
        const stores = rawStores.map(s => s.Store || s).filter(Boolean);
        storeCount = stores.length;

        if (stores && stores.length > 0) {
            catalogSearch = "ok";
            const first = stores[0];
            sampleStoreId = first?.Id || first?.id || null;

            if (sampleStoreId) {
                try {
                    const st = await getStoreItems(titleId, sampleStoreId, osName);
                    const itemsArr = st?.Items || st?.items || [];
                    sampleStoreItemCount = itemsArr.length;
                    if (itemsArr && itemsArr.length >= 0) {
                        getStore = "ok";
                    }
                } catch (e) {
                    const s = e && e.status;
                    if (s === 429) rateLimited = true;
                }
            }
        }
    } catch (e) {
        const s = e && e.status;
        if (s === 429) rateLimited = true;
    }

    return {
        catalogSearch,
        getStoreItems: getStore,
        rateLimited,
        storeCount,
        sampleStoreId,
        sampleStoreItemCount,
        titleId,
        os: osName
    };
}

async function checkSession() {
    const titleId = getPrimaryTitleId();
    const osName = process.env.OS || "iOS";

    try {
        const session = await getSession(titleId, osName);
        return {
            ok: true,
            titleId,
            os: osName,
            hasSessionTicket: !!session.SessionTicket,
            hasEntityToken: !!session.EntityToken,
            expiresAt: session.expiresAt || null,
            msUntilExpire: session.expiresAt ? session.expiresAt - Date.now() : null
        };
    } catch (err) {
        return {
            ok: false, titleId, os: osName, error: err && err.message ? err.message : "session_error"
        };
    }
}

function readIntEnv(key, def) {
    const raw = process.env[key];
    if (!raw) return def;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return def;
    return n;
}

function readBoolEnv(key) {
    return String(process.env[key] || "").toLowerCase() === "true";
}

function watcherDetails(w, envPrefix, enabledBool) {
    let intervalMs = null;
    let extra = {};

    if (envPrefix === "SALES") {
        intervalMs = readIntEnv("SALES_WATCH_INTERVAL_MS", 30000);
    } else if (envPrefix === "ITEM") {
        intervalMs = readIntEnv("ITEM_WATCH_INTERVAL_MS", 30000);
        extra = {
            pageTop: readIntEnv("ITEM_WATCH_TOP", 150), pages: readIntEnv("ITEM_WATCH_PAGES", 3)
        };
    } else if (envPrefix === "PRICE") {
        intervalMs = readIntEnv("PRICE_WATCH_INTERVAL_MS", 30000);
        extra = {
            maxStores: readIntEnv("PRICE_WATCH_MAX_STORES", 50), storeConcurrency: readIntEnv("STORE_CONCURRENCY", 4)
        };
    } else if (envPrefix === "TRENDING") {
        intervalMs = readIntEnv("TRENDING_INTERVAL_MS", 60000);
        extra = {
            windowHours: readIntEnv("TRENDING_WINDOW_HOURS", 24),
            pageTop: readIntEnv("TRENDING_PAGE_TOP", 200),
            pages: readIntEnv("TRENDING_PAGES", 3),
            topN: readIntEnv("TRENDING_TOP_N", 20)
        };
    }

    const running = !!w.running;
    const lastRunTs = w.lastRunTs || 0;
    const msSinceLastRun = lastRunTs ? Date.now() - lastRunTs : null;

    let status = "disabled";
    if (!enabledBool) {
        status = "disabled";
    } else if (enabledBool && !running) {
        status = "not_running";
    } else if (enabledBool && running) {
        if (!intervalMs || msSinceLastRun == null) {
            status = "unknown";
        } else {
            const staleThreshold = intervalMs * 4;
            status = msSinceLastRun > staleThreshold ? "stale" : "healthy";
        }
    }

    return {
        enabled: !!enabledBool,
        running,
        status,
        lastRunTs,
        msSinceLastRun,
        configuredIntervalMs: intervalMs,
        config: extra
    };
}

function getRuntimeInfo() {
    const mem = process.memoryUsage();
    const uptimeSeconds = process.uptime();
    const loadAvg = os.loadavg();
    const ru = process.resourceUsage ? process.resourceUsage() : null;

    return {
        timestamp: nowTs(),
        node: {
            pid: process.pid,
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            env: process.env.NODE_ENV || "development"
        },
        process: {
            uptimeSeconds, memory: {
                rss: mem.rss, heapTotal: mem.heapTotal, heapUsed: mem.heapUsed, external: mem.external
            }, resourceUsage: ru ? {
                userCPUSeconds: ru.userCPUTime / 1e6,
                systemCPUSeconds: ru.systemCPUTime / 1e6,
                involuntaryContextSwitches: ru.involuntaryContextSwitches,
                voluntaryContextSwitches: ru.voluntaryContextSwitches,
                fsReadOps: ru.fsRead,
                fsWriteOps: ru.fsWrite
            } : null
        },
        system: {
            hostname: os.hostname(),
            uptimeSeconds: os.uptime(),
            cpus: os.cpus().length,
            loadAvg1m: loadAvg[0],
            loadAvg5m: loadAvg[1],
            loadAvg15m: loadAvg[2],
            totalMem: os.totalmem(),
            freeMem: os.freemem()
        },
        trustProxy: typeof process.env.TRUST_PROXY === "undefined" ? 1 : process.env.TRUST_PROXY,
        logLevel: process.env.LOG_LEVEL || "info"
    };
}

function getCacheInfo() {
    const SESSION_TTL_MS = readIntEnv("SESSION_TTL_MS", 30 * 60 * 1000);
    const DATA_TTL_MS = readIntEnv("DATA_TTL_MS", 5 * 60 * 1000);

    return {
        sessionCache: {
            max: readIntEnv("SESSION_CACHE_MAX", 1000),
            ttlMsDefault: SESSION_TTL_MS,
            size: sessionCache ? sessionCache.size : undefined
        }, dataCache: {
            max: readIntEnv("DATA_CACHE_MAX", 20000),
            ttlMsDefault: DATA_TTL_MS,
            size: dataCache ? dataCache.size : undefined
        }
    };
}

function getSecretsInfo() {
    return {
        jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
        adminUserPresent: !!process.env.ADMIN_USER,
        adminPassPresent: !!process.env.ADMIN_PASS
    };
}

function getRoutesInfo() {
    return {
        auth: {
            login: "/login",
            openapi: "/openapi.json",
            docsEnabled: readBoolEnv("ENABLE_DOCS")
        },
        core: {
            titles: "/titles",
            creators: "/creators",
            session: "/session/:alias"
        },
        marketplace: {
            base: "/marketplace",
            all: "/marketplace/all/:alias",
            latest: "/marketplace/latest/:alias",
            popular: "/marketplace/popular/:alias",
            free: "/marketplace/free/:alias",
            tag: "/marketplace/tag/:alias/:tag",
            details: "/marketplace/details/:alias/:itemId",
            friendly: "/marketplace/friendly/:alias/:friendlyId",
            resolveByItemId: "/marketplace/resolve/:alias/:itemId",
            resolveByFriendly: "/marketplace/resolve/friendly/:alias/:friendlyId",
            summary: "/marketplace/summary/:alias",
            compare: "/marketplace/compare/:creatorName",
            searchBasic: "/marketplace/search/:alias",
            searchAdvanced: "/marketplace/search/advanced/:alias",
            recommendations: "/marketplace/recommendations/:itemId",
            stats: "/marketplace/:creatorName/stats",
            featuredServers: "/marketplace/featured-servers",
            featuredPersona: "/marketplace/featured-content",
            sales: "/marketplace/sales[/::alias]"
        },
        events: {
            stream: "/events/stream"
        },
        webhooks: {
            base: "/webhooks"
        },
        health: "/health"
    };
}

function getConfigInfo() {
    const corsList = getConfiguredCorsOrigins();

    const rateLimitEnvEnabled = String(process.env.RATE_LIMIT_ENABLE || process.env.RATE_LIMIT_ENABLED || "").toLowerCase() === "true";
    const loginWindowDefault = 15 * 60 * 1000;
    const loginMaxDefault = 20;
    const loginWindowMs = rateLimitEnvEnabled ? readIntEnv("RATE_LIMIT_LOGIN_WINDOW_MS", readIntEnv("RATE_LIMIT_WINDOW_MS", loginWindowDefault)) : loginWindowDefault;
    const loginMax = rateLimitEnvEnabled ? readIntEnv("RATE_LIMIT_LOGIN_MAX", readIntEnv("RATE_LIMIT_MAX", loginMaxDefault)) : loginMaxDefault;

    return {
        service: {
            port: process.env.PORT || 3000,
            nodeEnv: process.env.NODE_ENV || "production",
            defaultAlias: process.env.DEFAULT_ALIAS || "prod",
            featuredPrimaryAlias: process.env.FEATURED_PRIMARY_ALIAS || process.env.DEFAULT_ALIAS || "prod",
            titleIdFallback: process.env.TITLE_ID || "20CA2",
            os: process.env.OS || "iOS",
            trustProxy: process.env.TRUST_PROXY,
            logLevel: process.env.LOG_LEVEL || "info"
        }, security: {
            validateRequests: readBoolEnv("VALIDATE_REQUESTS"),
            validateResponses: readBoolEnv("VALIDATE_RESPONSES"),
            enableDocs: readBoolEnv("ENABLE_DOCS"),
            corsEnabled: corsList.length > 0,
            corsOrigins: corsList,
            corsOriginCount: corsList.length,
            jwtSecretConfigured: !!process.env.JWT_SECRET
        }, paginationDefaults: {
            pageDefault: 1, pageSizeDefault: 24, pageSizeMax: 100, limitMax: 1000
        }, rateLimits: {
            loginWindowMs, loginMax
        }, watchersEnabled: {
            sales: readBoolEnv("ENABLE_SALES_WATCHER"),
            item: readBoolEnv("ENABLE_ITEM_WATCHER"),
            price: readBoolEnv("ENABLE_PRICE_WATCHER"),
            trending: readBoolEnv("ENABLE_TRENDING_WATCHER"),
            featuredContent: readBoolEnv("ENABLE_FEATURED_CONTENT_WATCHER")
        }, watcherIntervals: {
            salesMs: readIntEnv("SALES_WATCH_INTERVAL_MS", 30000),
            itemMs: readIntEnv("ITEM_WATCH_INTERVAL_MS", 30000),
            priceMs: readIntEnv("PRICE_WATCH_INTERVAL_MS", 30000),
            trendingMs: readIntEnv("TRENDING_INTERVAL_MS", 60000),
            featuredContentMs: readIntEnv("FEATURED_CONTENT_WATCH_INTERVAL_MS", 21600000)
        }, playfabNetworking: {
            upstreamTimeoutMs: readIntEnv("UPSTREAM_TIMEOUT_MS", 20000),
            retryBudget: readIntEnv("RETRY_BUDGET", 3),
            httpMaxSockets: readIntEnv("HTTP_MAX_SOCKETS", 512),
            httpsMaxSockets: readIntEnv("HTTPS_MAX_SOCKETS", 512)
        }, marketplace: {
            pageSize: readIntEnv("PAGE_SIZE", 100),
            multilangAll: readBoolEnv("MULTILANG_ALL"),
            enrichBatch: readIntEnv("MULTILANG_ENRICH_BATCH", 100),
            enrichConcurrency: readIntEnv("MULTILANG_ENRICH_CONCURRENCY", 5),
            storeConcurrency: readIntEnv("STORE_CONCURRENCY", 6),
            storeMaxForPriceEnrich: readIntEnv("STORE_MAX_FOR_PRICE_ENRICH", 500),
            advSearchTtlMs: readIntEnv("ADV_SEARCH_TTL_MS", 60000),
            advSearchBatch: readIntEnv("ADV_SEARCH_BATCH", 300),
            advSearchMaxBatches: readIntEnv("ADV_SEARCH_MAX_BATCHES", 10),
            maxSearchBatches: readIntEnv("MAX_SEARCH_BATCHES", 10),
            maxFetchBatches: readIntEnv("MAX_FETCH_BATCHES", 20),
            sessionTtlMs: readIntEnv("SESSION_TTL_MS", 1800000),
            dataTtlMs: readIntEnv("DATA_TTL_MS", 300000),
            reviewsEnabled: readBoolEnv("REVIEWS_ENABLED"),
            trendingWindowHours: readIntEnv("TRENDING_WINDOW_HOURS", 24)
        }
    };
}

function getSynthesisWatchers(watchers) {
    const out = {};
    let healthy = 0;
    let stale = 0;
    let disabled = 0;
    let notRunning = 0;
    let total = 0;

    for (const [, val] of Object.entries(watchers)) {
        total += 1;
        if (!val.enabled) {
            disabled += 1;
        } else if (val.status === "healthy") {
            healthy += 1;
        } else if (val.status === "stale") {
            stale += 1;
        } else if (val.status === "not_running") {
            notRunning += 1;
        }
    }

    out.total = total;
    out.healthy = healthy;
    out.stale = stale;
    out.disabled = disabled;
    out.notRunning = notRunning;

    let overall = "green";
    if (stale > 0 || notRunning > 0) overall = "yellow";
    if (healthy === 0 && total > 0 && disabled === 0) overall = "red";

    out.overall = overall;
    return out;
}

function buildStatusFlags({upstream, session}) {
    const upstreamOk = upstream.catalogSearch === "ok" && (upstream.getStoreItems === "ok" || upstream.getStoreItems === "error");

    const sessionOk = session.ok === true && session.hasEntityToken;

    const rateLimited = !!upstream.rateLimited;

    let level = "green";
    if (!upstreamOk || !sessionOk) level = "red"; else if (rateLimited) level = "yellow";

    return {
        overall: level, upstreamOk, sessionOk, rateLimited
    };
}

exports.getHealth = async (_req, res, next) => {
    try {
        const upstream = await dataCache.getOrSetAsync("health-upstream-v4", async () => {
            return checkUpstream();
        }, 5000);

        const sessionInfo = await dataCache.getOrSetAsync("health-session-v4", async () => {
            return checkSession();
        }, 5000);

        const configInfo = getConfigInfo();

        const watchers = {
            salesWatcher: watcherDetails(salesWatcher, "SALES", configInfo.watchersEnabled.sales),
            itemWatcher: watcherDetails(itemWatcher, "ITEM", configInfo.watchersEnabled.item),
            priceWatcher: watcherDetails(priceWatcher, "PRICE", configInfo.watchersEnabled.price),
            trendingWatcher: watcherDetails(trendingWatcher, "TRENDING", configInfo.watchersEnabled.trending)
        };

        const watcherOverview = getSynthesisWatchers(watchers);

        const runtime = getRuntimeInfo();
        const cacheInfo = getCacheInfo();
        const secretsInfo = getSecretsInfo();
        const routesInfo = getRoutesInfo();
        const flags = buildStatusFlags({upstream, session: sessionInfo});

        const response = {
            healthVersion: "v4",
            ok: flags.overall === "green" || flags.overall === "yellow",
            timestamp: nowTs(),
            flags,
            playfab: {
                titleId: upstream.titleId, os: upstream.os, session: sessionInfo, upstreamChecks: {
                    catalogSearch: upstream.catalogSearch,
                    getStoreItems: upstream.getStoreItems,
                    rateLimited: upstream.rateLimited,
                    storeCount: upstream.storeCount,
                    sampleStoreId: upstream.sampleStoreId,
                    sampleStoreItemCount: upstream.sampleStoreItemCount
                }
            },
            watchers,
            watcherOverview,
            cache: cacheInfo,
            runtime,
            config: configInfo,
            secretsMeta: secretsInfo,
            routes: routesInfo
        };

        res.json(response);
    } catch (e) {
        next(e);
    }
};
