# Configuration

> [!NOTE]
> This page is generated from repository source files. Last generated: 2026-04-26T19:30:40.019Z.
> Manual edits in the wiki may be overwritten by the next sync.

Configuration is driven by environment variables. The table below is discovered from `src/**/*.js` references, so it stays aligned with the implementation.

## Discovered Variables

| Variable | Referenced From |
| --- | --- |
| `ADMIN_PASS` | `src/controllers/healthController.js`<br>`src/index.js` |
| `ADMIN_USER` | `src/controllers/healthController.js`<br>`src/index.js` |
| `ADV_SEARCH_BATCH` | `src/services/advancedSearchService.js` |
| `ADV_SEARCH_MAX_BATCHES` | `src/services/advancedSearchService.js` |
| `ADV_SEARCH_TTL_MS` | `src/controllers/marketplace/searchAdvancedController.js` |
| `CORS_ORIGINS` | `src/utils/corsOrigins.js` |
| `CREATOR_STATS_TTL_MS` | `src/controllers/marketplace/statsController.js` |
| `DATA_CACHE_MAX` | `src/config/cache.js` |
| `DATA_TTL_MS` | `src/config/cache.js` |
| `DEFAULT_ALIAS` | `src/controllers/healthController.js`<br>`src/controllers/marketplace/featuredPersonaController.js`<br>`src/controllers/marketplace/featuredServersController.js`<br>`src/controllers/marketplace/mcTokenController.js`<br>`src/services/featuredContentWatcher.js`<br>`src/services/itemWatcher.js`<br>`src/services/marketplaceService.js`<br>`src/services/priceWatcher.js`<br>`src/services/salesWatcher.js`<br>`src/services/trendingWatcher.js` |
| `DETAILS_TTL_MS` | `src/controllers/marketplace/detailsController.js` |
| `ENABLE_DOCS` | `src/index.js` |
| `ENABLE_FEATURED_CONTENT_WATCHER` | `src/index.js` |
| `ENABLE_ITEM_WATCHER` | `src/index.js` |
| `ENABLE_PRICE_WATCHER` | `src/index.js` |
| `ENABLE_SALES_WATCHER` | `src/index.js` |
| `ENABLE_TRENDING_WATCHER` | `src/index.js` |
| `FEATURED_CONTENT_WATCH_INTERVAL_MS` | `src/services/featuredContentWatcher.js` |
| `FEATURED_PRIMARY_ALIAS` | `src/controllers/healthController.js`<br>`src/controllers/marketplace/featuredPersonaController.js`<br>`src/controllers/marketplace/featuredServersController.js`<br>`src/controllers/marketplace/mcTokenController.js`<br>`src/services/featuredContentWatcher.js`<br>`src/services/itemWatcher.js`<br>`src/services/marketplaceService.js`<br>`src/services/priceWatcher.js`<br>`src/services/salesWatcher.js`<br>`src/services/trendingWatcher.js` |
| `FEATURED_SERVERS_TTL_MS` | `src/controllers/marketplace/featuredServersController.js` |
| `FETCH_CONCURRENCY` | `src/services/marketplaceService.js` |
| `FX_USD_PER_EUR` | `src/services/marketplaceService.js` |
| `HTTP_MAX_SOCKETS` | `src/services/featuredPersonaService.js`<br>`src/services/featuredServersService.js`<br>`src/utils/playfab.js` |
| `HTTPS_MAX_SOCKETS` | `src/services/featuredPersonaService.js`<br>`src/services/featuredServersService.js`<br>`src/utils/playfab.js` |
| `ITEM_BY_ID_CACHE_TTL_MS` | `src/utils/playfab.js` |
| `ITEM_WATCH_BOOTSTRAP_ITEMS_PER_REQUEST` | `src/services/itemWatcher.js` |
| `ITEM_WATCH_BOOTSTRAP_MAX_ITEMS` | `src/services/itemWatcher.js` |
| `ITEM_WATCH_INTERVAL_MS` | `src/services/itemWatcher.js` |
| `ITEM_WATCH_ITEMS_PER_REQUEST` | `src/services/itemWatcher.js` |
| `ITEM_WATCH_MAX_ITEMS` | `src/services/itemWatcher.js` |
| `ITEM_WATCH_OVERLAP_MS` | `src/services/itemWatcher.js` |
| `JWT_SECRET` | `src/controllers/healthController.js`<br>`src/index.js` |
| `LOG_LEVEL` | `src/config/logger.js`<br>`src/controllers/healthController.js`<br>`src/index.js` |
| `MAX_FETCH_BATCHES` | `src/services/marketplaceService.js`<br>`src/utils/playfab.js` |
| `MAX_SEARCH_BATCHES` | `src/services/marketplaceService.js` |
| `MC_APPLICATION_TYPE` | `src/services/featuredServersService.js` |
| `MC_AUTH_BASE` | `src/services/featuredServersService.js` |
| `MC_CLIENT_VERSION` | `src/services/featuredServersService.js` |
| `MC_CLIENT_VERSION_TTL_MS` | `src/services/featuredServersService.js` |
| `MC_CLIENT_VERSION_URL` | `src/services/featuredServersService.js` |
| `MC_DISCOVERY_BASE` | `src/services/featuredServersService.js` |
| `MC_FEATURED_FILTER` | `src/services/featuredServersService.js` |
| `MC_FEATURED_ORDER` | `src/services/featuredServersService.js` |
| `MC_FEATURED_SCID` | `src/services/featuredServersService.js` |
| `MC_FEATURED_SELECT` | `src/services/featuredServersService.js` |
| `MC_FEATURED_TOP` | `src/services/featuredServersService.js` |
| `MC_LANGUAGE` | `src/services/featuredServersService.js` |
| `MC_LANGUAGE_CODE` | `src/services/featuredPersonaService.js`<br>`src/services/featuredServersService.js` |
| `MC_PERSONA_INVENTORY_VERSION` | `src/services/featuredPersonaService.js` |
| `MC_PERSONA_LIST_VERSION` | `src/services/featuredPersonaService.js` |
| `MC_PERSONA_PAGE` | `src/services/featuredPersonaService.js` |
| `MC_PERSONA_TTL_MS` | `src/controllers/marketplace/featuredPersonaController.js` |
| `MC_PLATFORM` | `src/services/featuredServersService.js` |
| `MC_REGION_CODE` | `src/services/featuredServersService.js` |
| `MC_STORE_BASE` | `src/services/featuredPersonaService.js` |
| `MC_STORE_PLATFORM` | `src/services/featuredServersService.js` |
| `MC_TOKEN_TTL_MS` | `src/services/featuredServersService.js` |
| `MC_TOKEN_TYPE` | `src/services/featuredServersService.js` |
| `MULTILANG_ALL` | `src/services/marketplaceService.js` |
| `MULTILANG_ENRICH_BATCH` | `src/services/marketplaceService.js` |
| `MULTILANG_ENRICH_CONCURRENCY` | `src/services/marketplaceService.js` |
| `NODE_ENV` | `src/controllers/healthController.js`<br>`src/index.js` |
| `OS` | `src/controllers/healthController.js`<br>`src/controllers/sessionController.js`<br>`src/services/advancedSearchService.js`<br>`src/services/featuredServersService.js`<br>`src/services/itemWatcher.js`<br>`src/services/marketplaceService.js`<br>`src/services/priceWatcher.js`<br>`src/services/salesWatcher.js`<br>`src/services/trendingWatcher.js` |
| `PORT` | `src/config/swagger.js`<br>`src/controllers/healthController.js`<br>`src/index.js` |
| `PRICE_WATCH_INTERVAL_MS` | `src/services/priceWatcher.js` |
| `PRICE_WATCH_MAX_STORES` | `src/services/priceWatcher.js` |
| `RATE_LIMIT_ENABLE` | `src/config/rateLimiter.js`<br>`src/controllers/healthController.js` |
| `RATE_LIMIT_ENABLED` | `src/config/rateLimiter.js`<br>`src/controllers/healthController.js` |
| `RECOMMENDATIONS_TTL_MS` | `src/controllers/marketplace/recommendationsController.js` |
| `RETRY_BUDGET` | `src/utils/playfab.js` |
| `SALES_TTL_MS` | `src/controllers/marketplace/salesController.js` |
| `SALES_WATCH_INTERVAL_MS` | `src/services/salesWatcher.js` |
| `SESSION_CACHE_MAX` | `src/config/cache.js` |
| `SESSION_TTL_MS` | `src/config/cache.js` |
| `SSE_HEARTBEAT_MS` | `src/services/sseHub.js` |
| `STORE_CONCURRENCY` | `src/services/marketplaceService.js`<br>`src/services/priceWatcher.js`<br>`src/services/salesWatcher.js` |
| `STORE_MAX_FOR_PRICE_ENRICH` | `src/services/marketplaceService.js` |
| `SUMMARY_TTL_MS` | `src/controllers/marketplace/summaryController.js` |
| `SWAGGER_SERVER_URL` | `src/config/swagger.js` |
| `TITLE_ID` | `src/controllers/healthController.js`<br>`src/controllers/marketplace/featuredPersonaController.js`<br>`src/controllers/marketplace/featuredServersController.js`<br>`src/controllers/marketplace/mcTokenController.js`<br>`src/services/featuredContentWatcher.js`<br>`src/services/itemWatcher.js`<br>`src/services/marketplaceService.js`<br>`src/services/priceWatcher.js`<br>`src/services/salesWatcher.js`<br>`src/services/trendingWatcher.js` |
| `TRENDING_INTERVAL_MS` | `src/services/trendingWatcher.js` |
| `TRENDING_PAGE_TOP` | `src/services/trendingWatcher.js` |
| `TRENDING_PAGES` | `src/services/trendingWatcher.js` |
| `TRENDING_TOP_N` | `src/services/trendingWatcher.js` |
| `TRENDING_WINDOW_HOURS` | `src/services/trendingWatcher.js` |
| `TRUST_PROXY` | `src/controllers/healthController.js`<br>`src/index.js` |
| `UPSTREAM_RESPONSE_CACHE_TTL_MS` | `src/utils/playfab.js` |
| `UPSTREAM_TIMEOUT_MS` | `src/services/featuredPersonaService.js`<br>`src/services/featuredServersService.js`<br>`src/utils/playfab.js` |
| `VALIDATE_REQUESTS` | `src/index.js` |
| `VALIDATE_RESPONSES` | `src/index.js` |
| `WEBHOOK_CONCURRENCY` | `src/services/webhookDispatcher.js` |
| `WEBHOOK_MAX_RETRIES` | `src/services/webhookDispatcher.js` |
| `WEBHOOK_QUEUE_MAX` | `src/services/webhookDispatcher.js` |
| `WEBHOOK_RETRY_BASE_MS` | `src/services/webhookDispatcher.js` |
| `WEBHOOK_RETRY_MAX_MS` | `src/services/webhookDispatcher.js` |
| `WEBHOOK_TIMEOUT_MS` | `src/controllers/webhookController.js`<br>`src/services/webhookDispatcher.js` |

## Required Runtime Values

- `JWT_SECRET` must be set and must be at least 32 characters long.
- `ADMIN_USER` and `ADMIN_PASS` control login credentials for admin JWT creation.
- `TITLE_ID`, `DEFAULT_ALIAS`, and `FEATURED_PRIMARY_ALIAS` control default PlayFab title resolution.

## Operational Toggles

- `ENABLE_DOCS` exposes Swagger UI.
- `VALIDATE_REQUESTS` enables OpenAPI request validation.
- `VALIDATE_RESPONSES` enables OpenAPI response validation.
- `ENABLE_SALES_WATCHER`, `ENABLE_ITEM_WATCHER`, `ENABLE_PRICE_WATCHER`, `ENABLE_TRENDING_WATCHER`, and `ENABLE_FEATURED_CONTENT_WATCHER` control background event producers.
- `RATE_LIMIT_ENABLE` or `RATE_LIMIT_ENABLED` enables configurable rate limiter overrides.

## Security Notes

Never commit local `.env` files, JWT secrets, admin passwords, webhook secrets, or deployment credentials. Treat generated wiki content as public documentation.
