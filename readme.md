# PlayFab-Catalog Service - Minecraft Bedrock Edition

> **Node.js/Express** API for browsing, comparing, and monitoring PlayFab Catalog marketplace items — with JWT auth, LRU caching, OpenAPI validation, SSE event streams, and webhooks. Built for high throughput with keep-alive HTTP agents, debounced caching, and resilient upstream retries.

[![Runtime](https://img.shields.io/badge/runtime-Node.js_18%2B-339933?logo=node.js)](#)
[![Framework](https://img.shields.io/badge/framework-Express-000?logo=express)](#)
[![OpenAPI](https://img.shields.io/badge/docs-/openapi.json-blue)](#)
[![Auth](https://img.shields.io/badge/auth-JWT-orange)](#)
[![Status](https://img.shields.io/badge/stability-stable-success)](#)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quickstart](#quickstart)
- [Configuration (Environment)](#configuration-environment)
- [Data Files & Local Storage](#data-files--local-storage)
- [Runtime & Architecture](#runtime--architecture)
- [Security Model](#security-model)
- [HTTP API](#http-api)
  - [Authentication & Tokens](#authentication--tokens)
  - [Global Conventions](#global-conventions)
  - [Routes Summary](#routes-summary)
  - [Routes — Detailed Reference](#routes--detailed-reference)
  - [Usage Examples (cURL)](#usage-examples-curl)
- [Pagination & Caching (ETag/Cache-Control)](#pagination--caching-etagcache-control)
- [Error Model](#error-model)
- [Rate Limiting](#rate-limiting)
- [Server-Sent Events (SSE)](#server-sent-events-sse)
- [Webhooks](#webhooks)
- [OpenAPI & Swagger UI](#openapi--swagger-ui)
- [Logging](#logging)
- [Caching Layers](#caching-layers)
- [Data Model (Transformed Item)](#data-model-transformed-item)
- [Directory Layout](#directory-layout)
- [Development & Utilities](#development--utilities)
- [Testing](#testing)
- [Performance Tuning](#performance-tuning)
- [Deployment](#deployment)
  - [Docker](#docker)
  - [docker-compose](#docker-compose)
  - [Kubernetes (snippet)](#kubernetes-snippet)
  - [Reverse Proxy (Nginx)](#reverse-proxy-nginx)
- [Observability & Ops](#observability--ops)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**PlayFab-Catalog Bedrock API** provides a read-optimized façade over the **PlayFab Catalog**. It consolidates listing, search, tag exploration, “featured servers”, price/sale aggregation, as well as **advanced search** with facets. For live insights, it emits **SSE** signals for item changes, price changes, featured content updates, and trending creators, and forwards events to external systems using **webhooks** with signatures and retries.

The service is intentionally stateless (except JSON files on disk) and production-friendly: aggressive keep-alive, retry budget, de-duped in-flight requests, and LRU caches for hot data.

---

## Key Features

- 🔐 **JWT authentication** with role guards (admin endpoints).
- 🎛️ **Configurable** via environment with sensible defaults.
- ⚡ **Throughput**: Node keep-alive agents + safe retry/jitter/backoff.
- 🧾 **ETags** and **Cache-Control** for CDN/proxy friendliness.
- ✅ **OpenAPI** schema with optional request/response validation.
- 🔎 **Advanced search** (filters, sort, pagination, facets).
- 🧩 **Item enrichment** (resolved references, prices, reviews).
- 🧭 **Featured servers** backed by config + live catalog resolution.
- 🛍️ **Sales aggregator** across stores; per-creator slicing.
- 📡 **SSE** for `item.*`, `price.changed`, `sale.*`, `creator.trending`, `featured.content.updated`.
- 🔔 **Webhooks** with HMAC signature (`sha256=<hex>` over JSON body) and retry/backoff.
- 🧰 **Tooling**: OpenAPI ref fixer, request logger, pagination helpers.

---

## Quickstart

```bash
# 1) Clone & install
git clone https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock
cd playfab-catalog-api
npm ci

# 2) Configure environment
cp .env.example .env
# IMPORTANT: set JWT_SECRET (>= 32 chars), ADMIN_USER/ADMIN_PASS, DEFAULT_ALIAS/TITLE_ID, etc.

# 3) Start (development)
NODE_ENV=development node src/index.js

# 4) Production
NODE_ENV=production LOG_LEVEL=info node src/index.js
````

**Base URL** (default): `http://localhost:3000`

---

## Configuration (Environment)

> **Required**: `JWT_SECRET` (>= 32 chars). Server exits if missing/too short.

### General

| Variable              | Default      | Description                               |
| --------------------- | ------------ | ----------------------------------------- |
| `PORT`                | `3000`       | HTTP port                                 |
| `NODE_ENV`            | `production` | `development` | `production`              |
| `JWT_SECRET`          | —            | JWT signing secret (**>= 32 chars**)      |
| `ADMIN_USER`          | —            | Username for `/login`                     |
| `ADMIN_PASS`          | —            | Password for `/login`                     |
| `LOG_LEVEL`           | `info`       | `error` | `warn` | `info` | `debug`       |
| `CORS_ORIGINS`        | `http://localhost:5173,https://view-marketplace.net` | Comma-separated list of allowed browser origins |
| `TRUST_PROXY`         | `1`          | Express `trust proxy`                     |
| `ENABLE_DOCS`         | `false`      | Serve Swagger UI at `/docs`               |
| `VALIDATE_REQUESTS`   | `false`      | Enable OpenAPI request validation         |
| `VALIDATE_RESPONSES`  | `false`      | Enable OpenAPI response validation        |
| `UPSTREAM_TIMEOUT_MS` | `20000`      | Axios timeout for PlayFab requests        |
| `HTTP_MAX_SOCKETS`    | `512`        | Keep-alive sockets (HTTP)                 |
| `HTTPS_MAX_SOCKETS`   | `512`        | Keep-alive sockets (HTTPS)                |

### PlayFab / Titles / OS

| Variable                 | Default | Description                                     |
| ------------------------ | ------- | ----------------------------------------------- |
| `TITLE_ID`               | `20CA2` | Fallback TitleId (used if alias not provided)   |
| `DEFAULT_ALIAS`          | `prod`  | Default alias → TitleId mapping (see `/titles`) |
| `FEATURED_PRIMARY_ALIAS` | `prod`  | Primary alias for featured/SSE sources          |
| `OS`                     | `iOS`   | OS label used in upstream requests              |
| `PLAYFAB_CONCURRENCY`    | `12`    | Parallel PlayFab requests                       |
| `PLAYFAB_BATCH`          | `600`   | Max batch size for bulk PlayFab calls           |

### Caching / TTLs / Sizes

| Variable            | Default   | Description                          |
| ------------------- | --------- | ------------------------------------ |
| `SESSION_TTL_MS`    | `1800000` | LRU session TTL (ms)                 |
| `SESSION_CACHE_MAX` | `1000`    | Max entries in session cache         |
| `DATA_TTL_MS`       | `300000`  | LRU generic data TTL (ms)            |
| `DATA_CACHE_MAX`    | `20000`   | Max entries in generic data cache    |
| `ADV_SEARCH_TTL_MS` | `60000`   | TTL for advanced search cache (ms)   |
| `PAGE_SIZE`         | `100`     | Default page size for list endpoints |

### Watchers & SSE

| Variable                  | Default | Description                                 |
| ------------------------- | ------- | ------------------------------------------- |
| `ENABLE_SALES_WATCHER`    | `true`  | Enable sales watcher                        |
| `ENABLE_ITEM_WATCHER`     | `true`  | Enable item watcher                         |
| `ENABLE_PRICE_WATCHER`    | `true`  | Enable price watcher                        |
| `ENABLE_TRENDING_WATCHER` | `true`  | Enable trending watcher                     |
| `SSE_HEARTBEAT_MS`        | `15000` | SSE heartbeat interval (min 5000)           |
| `SALES_WATCH_INTERVAL_MS` | `30000` | Sales watcher interval                      |
| `PRICE_WATCH_INTERVAL_MS` | `30000` | Price watcher interval                      |
| `ITEM_WATCH_INTERVAL_MS`  | `30000` | Item watcher interval                       |
| `ITEM_WATCH_TOP`          | `150`   | Items per page scanned in item watcher      |
| `ITEM_WATCH_PAGES`        | `3`     | Pages scanned per cycle in item watcher     |
| `TRENDING_INTERVAL_MS`    | `60000` | Trending watcher interval                   |
| `TRENDING_WINDOW_HOURS`   | `24`    | Window for trending scoring                 |
| `TRENDING_PAGE_TOP`       | `200`   | Items per page scanned in trending watcher  |
| `TRENDING_PAGES`          | `3`     | Pages scanned per cycle in trending watcher |
| `TRENDING_TOP_N`          | `20`    | Top creators emitted per trending window    |
| `STORE_CONCURRENCY`       | `6`     | Parallel store requests                     |
| `PRICE_WATCH_MAX_STORES`  | `50`    | Max stores scanned for price signature      |

### Search / Enrichment

| Variable                       | Default | Description                           |
| ------------------------------ | ------- | ------------------------------------- |
| `MAX_SEARCH_BATCHES`           | `10`    | Batches for paginated search          |
| `MAX_FETCH_BATCHES`            | `20`    | Batches for “all items” fetch         |
| `ADV_SEARCH_BATCH`             | `300`   | Batch size advanced search            |
| `ADV_SEARCH_MAX_BATCHES`       | `10`    | Max batches advanced search           |
| `MULTILANG_ALL`                | `true`  | Enrich via `GetItems` for all results |
| `MULTILANG_ENRICH_BATCH`       | `100`   | `GetItems` batch size                 |
| `MULTILANG_ENRICH_CONCURRENCY` | `5`     | `GetItems` concurrency                |
| `STORE_MAX_FOR_PRICE_ENRICH`   | `500`   | Stores consulted per item (prices)    |

### Reviews

| Variable              | Default | Description                                  |
| --------------------- | ------- | -------------------------------------------- |
| `REVIEWS_ENABLED`     | `true`  | Enable review enrichment in item details     |
| `REVIEWS_FETCH_COUNT` | `20`    | Number of reviews to fetch per item (sample) |

### Webhooks

| Variable              | Default | Description                   |
| --------------------- | ------- | ----------------------------- |
| `WEBHOOK_TIMEOUT_MS`  | `5000`  | Upstream webhook timeout (ms) |
| `WEBHOOK_MAX_RETRIES` | `3`     | Max webhook delivery retries  |
| `WEBHOOK_CONCURRENCY` | `4`     | Parallel webhook deliveries   |

### Rate Limiting

| Variable                           | Default  | Description                            |
| ---------------------------------- | -------- | -------------------------------------- |
| `RATE_LIMIT_ENABLED`               | `true`   | Toggle rate limiting globally          |
| `RATE_LIMIT_DEFAULT_WINDOW_MS`     | `60000`  | Default window for generic routes      |
| `RATE_LIMIT_DEFAULT_MAX`           | `60`     | Default max requests per window        |
| `RATE_LIMIT_LOGIN_WINDOW_MS`       | `900000` | `/login` window (15 minutes)           |
| `RATE_LIMIT_LOGIN_MAX`             | `20`     | Max login attempts per window          |
| `RATE_LIMIT_MARKETPLACE_WINDOW_MS` | `60000`  | Window for `/marketplace` routes       |
| `RATE_LIMIT_MARKETPLACE_MAX`       | `120`    | Max `/marketplace` requests per window |
| `RATE_LIMIT_EVENTS_WINDOW_MS`      | `60000`  | Window for `/events` endpoints         |
| `RATE_LIMIT_EVENTS_MAX`            | `120`    | Max `/events` requests per window      |
| `RATE_LIMIT_ADMIN_WINDOW_MS`       | `60000`  | Window for `/admin` routes             |
| `RATE_LIMIT_ADMIN_MAX`             | `60`     | Max `/admin` requests per window       |
| `RATE_LIMIT_HEALTH_WINDOW_MS`      | `10000`  | Window for health endpoints            |
| `RATE_LIMIT_HEALTH_MAX`            | `120`    | Max health checks per window           |

---

## Data Files & Local Storage

This service uses small JSON files under `src/data/` which you should **persist** in production (bind mount / volume):

* `titles.json` — alias → TitleId mapping. Example:

  ```json
  {
    "production": { "id": "20CA2", "notes": "Production title" },
    "staging":  { "id": "AB123", "notes": "Staging" }
  }
  ```
* `creators.json` — creator registry used for search resolution:

  ```json
  [
    { "id": "creator-uuid", "creatorName": "SomeCreator", "displayName": "Some Creator" }
  ]
  ```
* `webhooks.json` — persisted webhook registrations (auto-managed).

> If these files are missing, the API will warn (e.g., creators) or initialize to empty structures.

---

## Runtime & Architecture

```
Client ──► /login ──► JWT ─┐
                           │        ┌───────────────┐
(Bearer) ───────────────────┼──────► │ Express API   │
                           │        │  • Routes     │
                           │        │  • Middleware │
                           │        └─────┬─────────┘
                           │              │
                           │              ▼
                           │        ┌───────────────┐
                           │        │ Services      │
                           │        │  • marketplace│
                           │        │  • advanced   │
                           │        │  • watchers   │
                           │        └─────┬─────────┘
                           │              │
                           │              ▼
                           │        ┌───────────────┐
                           │        │ utils/playfab │──► PlayFab API
                           │        │ (Axios, Retry │
                           │        │  Keep-Alive)  │
                           │        └───────────────┘
                           │
SSE ◄────────────────────────── EventBus + Watchers (sales/items/prices/trending)
Webhooks ◄───────────────────── WebhookService (signature, retry/backoff)
Cache  ◄─────────────────────── LRU (sessions/data) + getOrSetAsync de-dup
```

**Highlights**

* Central `sendPlayFabRequest()` adds retries, jittered backoff, and 429 handling using `Retry-After` when present.
* LRU session cache ensures minimal auth churn (`SessionTicket` + `EntityToken`).
* ETag middleware serializes handler results and computes weak ETags (`W/"<hex>-<sha1-16>"`).

---

## Security Model

* **Auth**: All routes require `Authorization: Bearer <jwt>` *except* `/login`, `/openapi.json`, `/docs` (when enabled), and `GET /marketplace/mc-token`.
* **Roles**: `role=admin` is required for:

  * `GET /session/:alias`
  * `POST /webhooks`
* **Input validation**: `express-validator` on most routes.
* **Helmet**: baseline HTTP protection; CSP disabled for Swagger UI compatibility.
* **CORS**: enabled for `http://localhost:5173` and `https://view-marketplace.net` by default; override via `CORS_ORIGINS` (comma-separated).

---

## HTTP API

### Authentication & Tokens

**POST `/login`**
Body:

```json
{ "username": "<ADMIN_USER>", "password": "<ADMIN_PASS>" }
```

Response:

```json
{ "token": "<jwt>" }
```

The token encodes `{ role: "admin" }` for admin credentials. Use it via `Authorization: Bearer <jwt>`.

**GET `/marketplace/mc-token`**
Returns a Minecraft Services token for the configured primary title (`FEATURED_PRIMARY_ALIAS` → `DEFAULT_ALIAS` → `TITLE_ID`). !!!No Auth Token required!!!.

Response:

```json
{ "titleId": "20CA2", "token": "<mc-token>" }
```

---

### Global Conventions

* `Content-Type: application/json; charset=utf-8`
* ETags for GETs; send `If-None-Match` to leverage `304 Not Modified`.
* Pagination opt-in:

  * `page` (≥1), `pageSize` (1..100)
  * or `skip` and `limit` (1..1000)
* Response pagination headers:

  * `X-Total-Count`
  * `Content-Range: items <start>-<end>/<total>`

---

### Routes Summary

#### System & Docs

| Method | Path            | Description               | Auth |
| ------ | --------------- | ------------------------- | ---- |
| GET    | `/`             | Service banner/health     | ✅    |
| GET    | `/openapi.json` | OpenAPI spec              | ❌    |
| GET    | `/docs`         | Swagger UI (when enabled) | ❌    |

#### Auth & Admin

| Method | Path              | Description          | Role      |
| ------ | ----------------- | -------------------- | --------- |
| POST   | `/login`          | Issue JWT            | —         |
| GET    | `/session/:alias` | Show PlayFab session | **admin** |
| POST   | `/webhooks` | Register webhooks    | **admin** |

#### Titles & Creators

| Method | Path             | Description                          |
| ------ | ---------------- | ------------------------------------ |
| GET    | `/titles`        | All alias→TitleId entries            |
| POST   | `/titles`        | Create alias `{ alias, id, notes? }` |
| DELETE | `/titles/:alias` | Remove alias                         |
| GET    | `/creators`      | List `creatorName`, `displayName`    |

#### Marketplace Catalog

| Method | Path                                               | Description                            |
| ------ | -------------------------------------------------- | -------------------------------------- |
| GET    | `/marketplace/all/:alias`                          | Entire catalog (optionally `?tag=...`) |
| GET    | `/marketplace/latest/:alias`                       | Latest items (`?count<=50`)            |
| GET    | `/marketplace/popular/:alias`                      | Popular by `rating/totalcount`         |
| GET    | `/marketplace/free/:alias`                         | Free items                             |
| GET    | `/marketplace/tag/:alias/:tag`                     | Filter by tag                          |
| GET    | `/marketplace/search/:alias`                       | Creator + keyword search               |
| GET    | `/marketplace/details/:alias/:itemId`              | Item details (optional enrichments)    |
| GET    | `/marketplace/friendly/:alias/:friendlyId`         | Resolve by FriendlyId                  |
| GET    | `/marketplace/resolve/:alias/:itemId`              | Resolve by ItemId (with references)    |
| GET    | `/marketplace/resolve/friendly/:alias/:friendlyId` | Resolve FriendlyId → item (+refs)      |
| GET    | `/marketplace/summary/:alias`                      | Compact list (id/title/links)          |
| GET    | `/marketplace/compare/:creatorName`                | Compare a creator across titles        |
| GET    | `/marketplace/featured-servers`                    | Curated featured servers               |
| GET    | `/marketplace/featured-content`                    | Featured persona items                 |
| GET    | `/marketplace/mc-token`                           | MC token for primary title             |
| GET    | `/marketplace/sales`                               | Aggregated sales across aliases        |
| GET    | `/marketplace/sales/:alias`                        | Aggregated sales for one alias         |
| POST   | `/marketplace/search/advanced/:alias`              | Advanced search + facets               |

---

### Routes — Detailed Reference

Below, `TOKEN` refers to the JWT from `/login`.

#### `GET /titles`

Returns all known aliases with notes.

```bash
curl -s "http://localhost:3000/titles" -H "Authorization: Bearer $TOKEN"
```

#### `POST /titles`

Create/update an alias → TitleId.

```bash
curl -s -X POST "http://localhost:3000/titles" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{ "alias":"my-title", "id":"20CA2", "notes":"Production" }'
```

#### `DELETE /titles/:alias`

Remove an alias mapping.

#### `GET /creators`

Paginated list of creators (from `src/data/creators.json`).

#### `GET /marketplace/all/:alias`

All catalog items for an alias, optional `?tag=...`. Supports pagination.

#### `GET /marketplace/latest/:alias?count=10`

Latest items (max 50).

#### `GET /marketplace/popular/:alias`

Sorted by `rating/totalcount desc`.

#### `GET /marketplace/free/:alias`

Items with `displayProperties/price = 0`.

#### `GET /marketplace/tag/:alias/:tag`

Filter by tag; fully enriched items (optionally with references).

#### `GET /marketplace/search/:alias?creatorName=<name>&keyword=<q>`

Creator is resolved via `creators.json` (matches `creatorName` or `displayName`, whitespace-insensitive).

#### `GET /marketplace/details/:alias/:itemId?expand=prices,reviews,refs`

* `prices`: fetch store prices for the item (bounded by `STORE_MAX_FOR_PRICE_ENRICH`).
* `reviews`: include `GetItemReviewSummary` + `GetItemReviews` sample (`REVIEWS_FETCH_COUNT`).
* `refs`: resolve `ItemReferences` to full items and return under `ResolvedReferences`.

#### `GET /marketplace/friendly/:alias/:friendlyId`

Get a single item by its `FriendlyId` (via a search), then fully resolve + references.

#### `GET /marketplace/resolve/:alias/:itemId`

Resolve an item by Id; will include `ResolvedReferences`.

#### `GET /marketplace/resolve/friendly/:alias/:friendlyId`

Same as `friendly`, explicit route for clarity.

#### `GET /marketplace/summary/:alias`

Compact list for link rendering:

```json
{ "id": "ItemId", "title": "Neutral Title", "detailsUrl": "...", "clientUrl": "..." }
```

#### `GET /marketplace/compare/:creatorName`

Compare one creator across **all configured titles** in `titles.json`. Returns `{ [alias]: items[] }`.

#### `GET /marketplace/featured-servers`

Returns a curated list from `src/config/featuredServers.js`, each resolved to a live item (if present).

#### `GET /marketplace/featured-content`

Returns featured persona items from the Dressing Room layout page.

#### `GET /marketplace/mc-token`

Returns the Minecraft Services authorization token for the configured primary title.

#### `GET /marketplace/sales` and `/marketplace/sales/:alias`

Aggregate store sales (from `SearchStores` + `GetStoreItems`) with items resolved. Optional `?creator=<displayName>` filters to a single creator. Returns:

```json
{
  "totalItems": 123,
  "itemsPerCreator": { "Creator A": 10, "Creator B": 5 },
  "sales": {
    "storeId": {
      "id": "storeId",
      "title": "Sale Title",
      "discountPercent": 30,
      "startDate": "2024-10-01T00:00:00Z",
      "endDate": "2024-10-08T00:00:00Z",
      "items": [ { "id": "...", "rawItem": { /* full item */ } } ]
    }
  }
}
```

#### `POST /marketplace/search/advanced/:alias`

Advanced Search now uses a **strict, fixed request body** with only three top-level fields: `query`, `filters`, `sort`.
Unknown fields are rejected with **400 Bad Request**.

```json
{
  "query": {
    "text": "valentine bundle"
  },
  "filters": {
    "id": "6656d5d4-d8ad-49a5-870f-04cb26d3ce26",
    "friendlyId": "f5c30f04-e47e-4a2c-88f1-313b868195dc",
    "alternateIds": [{ "type": "FriendlyId", "value": "f5c30f04-e47e-4a2c-88f1-313b868195dc" }],
    "keywords": ["bundle"],
    "isStackable": false,
    "platforms": ["android.googleplay"],
    "tags": ["hidden_offer", "3P"],
    "tagsAny": ["3P", "server"],
    "tagsAll": ["marketplace", "hidden_offer"],
    "contentKinds": ["world"],
    "creationDate": { "from": "2026-02-01T00:00:00Z", "to": "2026-02-28T23:59:59Z" },
    "lastModifiedDate": { "from": "2026-02-01T00:00:00Z", "to": "2026-02-28T23:59:59Z" },
    "startDate": { "from": "2026-02-01T00:00:00Z", "to": "2026-02-28T23:59:59Z" },
    "priceAmounts": { "min": 1000, "max": 1500, "currencyId": "ecd19d3c-7635-402c-a185-eb11cb6c6946" },
    "creatorName": "The Hive",
    "offerId": "f5c30f04-e47e-4a2c-88f1-313b868195dc",
    "purchasable": true,
    "packIdentityType": "durable",
    "ratingMin": 4.0
  },
  "sort": [
    { "field": "startDate", "dir": "desc" },
    { "field": "priceAmount", "dir": "asc" }
  ]
}
```

**Query behavior**

* `query.text` is forwarded to PlayFab `Search` (fuzzy/full-text; e.g., matches via title/description/indexed fields).

**Filter behavior (PlayFab vs API layer)**

The following filters are pushed directly to PlayFab OData in `Catalog/Search`:

* `id`
* `friendlyId`, `alternateIds`
* `isStackable`
* `platforms`
* `tags`, `tagsAny`, `tagsAll`
* `contentKinds` (`skinpack`, `world`, `persona`, `addon`)
* `creationDate`, `lastModifiedDate`, `startDate`
* `priceAmounts.min/max` (via `DisplayProperties/price`)
* `ratingMin` (via `rating/average`)
* `creatorName`
* `purchasable`

The following filters are additionally evaluated in the API layer (when PlayFab cannot reliably cover them directly):

* `keywords`
* `offerId`
* `packIdentityType`
* `priceAmounts`, including optional `currencyId` checks via `Price/PriceOptions`.

**Sorting**

Allowed sort fields:

* `id`, `type`, `title`, `description`, `keywords`
* `isStackable`, `platforms`, `tags`
* `creationDate`, `lastModifiedDate`, `startDate`
* `priceAmount`, `creatorName`, `purchasable`, `packIdentityType`

Not allowed (returns `400`):

* `offerId`
* `friendlyId`
* `alternateIds`

**Performance note**

* The service still uses paginated PlayFab batches (`ADV_SEARCH_BATCH`, `ADV_SEARCH_MAX_BATCHES`) and applies local filtering/sorting only after upstream fetch when required.

#### Events (SSE)

* `/events/stream` (optional query `events=<comma-separated-event-names>`):
  `item.snapshot`, `item.created`, `item.updated`, `sale.snapshot`, `sale.update`, `price.changed`, `creator.trending`, `featured.content.updated`.

#### Admin Webhooks

* `POST /webhooks` — register `{ events, url, secret? }`

---

### Usage Examples (cURL)

**Login**

```bash
curl -sS -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"'"$ADMIN_USER"'","password":"'"$ADMIN_PASS"'"}'
```

**Featured servers**

```bash
TOKEN="<jwt>"
curl -sS "http://localhost:3000/marketplace/featured-servers" \
  -H "Authorization: Bearer $TOKEN"
```

**Featured content**

```bash
TOKEN="<jwt>"
curl -sS "http://localhost:3000/marketplace/featured-content" \
  -H "Authorization: Bearer $TOKEN"
```

**Compare a creator across titles**

```bash
curl -sS "http://localhost:3000/marketplace/compare/SomeCreator" \
  -H "Authorization: Bearer $TOKEN"
```

**Resolve by FriendlyId**

```bash
curl -sS "http://localhost:3000/marketplace/resolve/friendly/my-alias/FRIENDLY_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**Sales (filtered by creator display name)**

```bash
curl -sS "http://localhost:3000/marketplace/sales?creator=Some%20Creator" \
  -H "Authorization: Bearer $TOKEN"
```

**SSE subscription (Node)**

```js
import EventSource from "eventsource";
const es = new EventSource("http://localhost:3000/events/stream?events=creator.trending", {
  headers: { Authorization: `Bearer ${token}` }
});
es.addEventListener("creator.trending", e => console.log(JSON.parse(e.data)));
es.addEventListener("ping", () => {});
```

---

## Pagination & Caching (ETag/Cache-Control)

* **Opt-in pagination**: pass `page`/`pageSize` or `skip`/`limit`.
* Headers:

  * `X-Total-Count`
  * `Content-Range: items <start>-<end>/<total>`
* **ETag**: Responses wrapped by `withETag()` set a weak ETag; if `If-None-Match` matches the current tag, the server returns **304** without a body.
* **Cache-Control** on most GET routes:

  * Example: `public, max-age=60, s-maxage=300, stale-while-revalidate=600`

---

## Error Model

```json
{
  "error": {
    "type": "bad_request | unauthorized | forbidden | not_found | internal_error",
    "message": "Human readable message",
    "details": [ /* express-validator issues, optional */ ],
    "traceId": "request correlation id"
  }
}
```

* The `traceId` mirrors `X-Request-Id` if provided, else a short random id.
* 4xx/5xx are normalized; in production 5xx messages become `Internal server error.`

---

## Rate Limiting

Rate limiting is controlled via the `RATE_LIMIT_*` environment variables.

* When `RATE_LIMIT_ENABLED=true`:

  * `/login` uses an `express-rate-limit` instance that, by default, allows **20 requests per 15 minutes** (configurable via `RATE_LIMIT_LOGIN_WINDOW_MS` and `RATE_LIMIT_LOGIN_MAX`).
  * Additional per-group limiters apply to marketplace, events, admin and health endpoints, using their respective `RATE_LIMIT_*` envs.
* Violations return `429 Too Many Requests` with a short JSON error.

---

## Server-Sent Events (SSE)

* Endpoints:

  * `/events/stream`
* Each stream sets required headers, flushes, and pings every `SSE_HEARTBEAT_MS` (min 5000).
* **Reconnect strategy**: clients should auto-reconnect; no `Last-Event-ID` is used.
* **Backpressure**: events are small JSON payloads; consumers should be idempotent.
* Watchers are toggled with:

  * `ENABLE_ITEM_WATCHER`, `ENABLE_PRICE_WATCHER`, `ENABLE_SALES_WATCHER`, `ENABLE_TRENDING_WATCHER`.

---

## Webhooks

**Register**

```bash
curl -sS -X POST http://localhost:3000/webhooks \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"event":"price.changed","url":"https://example.com/hook","secret":"<optional-256-max>"}'
```

**Events**: `sale.update`, `item.snapshot`, `item.created`, `item.updated`, `price.changed`, `creator.trending`, `featured.content.updated`

**Delivery**

* JSON body: `{ "event": "<name>", "ts": 1730000000000, "payload": { ... } }`
* Header: `X-Webhook-Signature: <sha1>` where the value is `sha1(stableStringify({ body, secret }))`
* Retries: up to `WEBHOOK_MAX_RETRIES` with exponential backoff + jitter
* Concurrency: `WEBHOOK_CONCURRENCY` (default 4)
* Timeout per delivery: `WEBHOOK_TIMEOUT_MS` (default 5000 ms)

**Verify signature (Node)**

```js
import crypto from "crypto";
function stableStringify(obj){ if(obj===null||typeof obj!=="object") return JSON.stringify(obj);
  if(Array.isArray(obj)) return "["+obj.map(stableStringify).join(",")+"]";
  const keys=Object.keys(obj).sort(); return "{"+keys.map(k=>JSON.stringify(k)+":"+stableStringify(obj[k])).join(",")+"}";
}
function verify(sig, body, secret){
  const expect = crypto.createHash("sha1").update(stableStringify({ body, secret })).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
}
```

**Verify signature (Python)**

```python
import hashlib, hmac, json
def stable(o):
    if isinstance(o, dict):
        return "{" + ",".join(f"{json.dumps(k)}:{stable(o[k])}" for k in sorted(o)) + "}"
    if isinstance(o, list):
        return "[" + ",".join(stable(x) for x in o) + "]"
    return json.dumps(o)
def verify(sig, body, secret):
    expect = hashlib.sha1(stable({"body": body, "secret": secret}).encode()).hexdigest()
    return hmac.compare_digest(sig, expect)
```

---

## OpenAPI & Swagger UI

* **Spec**: `GET /openapi.json` (always available)
* **Swagger UI**: `GET /docs` (when `ENABLE_DOCS=true`)

**Spec composition**

* Base: `src/docs/openapi-base.yaml`
* Schemas: `src/docs/schemas/**/*.yaml`
* Paths: `src/docs/paths/**/*.yaml`
* Builder: `config/swagger.js` merges all YAML parts

**Validator**

* `express-openapi-validator` plugged when `VALIDATE_REQUESTS=true` (and optionally `VALIDATE_RESPONSES=true`).
* Custom **BearerAuth** handler verifies JWT or throws standardized 401/403 early.

---

## Logging

* **Winston** logger with colorized console (chalk).
* `middleware/requestLogger` prints `→` and `←` lines at `debug` level including latency.
* Upstream calls log store counts, discount percents, item totals under `debug` to aid diagnosis.

---

## Caching Layers

* **LRU (sessionCache)** — PlayFab login session (`SessionTicket`, `EntityToken`), soft TTL with refresh via `getSession()`.
* **LRU (dataCache)** — Generic results via `getOrSetAsync(key, fn, ttlOverride?)` to deduplicate in-flight calls.
* **ETag** — Response entity tagging on controllers using `withETag(handler)`.
* **Cache headers** — Per-route `Cache-Control` hints via `cacheHeaders(seconds, smax)` in `index.js`.

---

## Data Model (Transformed Item)

Items are normalized by `utils/playfab.transformItem()`:

```ts
type TransformedImage = {
  Id: string;
  Tag: string;
  Type: "Thumbnail" | "Screenshot";
  Url: string;
};
type TransformedItem = {
  Id: string;
  Title: Record<string,string>;
  Description?: Record<string,string>;
  ContentType?: string;
  Tags?: string[];
  Platforms?: string[];
  Images: TransformedImage[]; // thumbnails first
  StartDate?: string;         // normalized from start/creation date
  DisplayProperties?: any;
  ResolvedReferences?: TransformedItem[]; // when expanded
  StorePrices?: Array<{ storeId: string; storeTitle: any; amounts: Array<{ currencyId: string; amount: number }> }>;
  Reviews?: { summary: any; reviews: any[] };
};
```

---

## Directory Layout

```
src/
  config/                 # caches, logger, rate limiter, swagger builder
  controllers/            # http handlers (marketplace, events, admin, etc.)
  middleware/             # etag, pagination, validators, request logging, sse heartbeat
  routes/                 # express routers per domain
  services/               # business logic, watchers, webhook service, event bus
  utils/                  # playfab client, titles/creators db, filter, pagination, hashing, storage
  scripts/                # OpenAPI ref fixer
  index.js                # Express bootstrap
```

---

## Development & Utilities

### OpenAPI reference fixer

Normalize schema refs / nullable patterns across `docs/`:

```bash
node src/scripts/fix-openapi-refs.js
```

### Enable request validation

```bash
VALIDATE_REQUESTS=true ENABLE_DOCS=true node src/index.js
```

### Verbose upstream diagnostics

```bash
LOG_LEVEL=debug node src/index.js
```

### Sample `.env`

```dotenv
PORT=3000
NODE_ENV=production
JWT_SECRET=please-change-me-to-a-very-long-random-string-32plus
ADMIN_USER=admin
ADMIN_PASS=change-me

DEFAULT_ALIAS=prod
TITLE_ID=20CA2
OS=iOS
TRUST_PROXY=1
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173,https://view-marketplace.net

HTTP_MAX_SOCKETS=512
HTTPS_MAX_SOCKETS=512
UPSTREAM_TIMEOUT_MS=20000
RETRY_BUDGET=3

SESSION_TTL_MS=1800000
SESSION_CACHE_MAX=1000
DATA_CACHE_MAX=20000
DATA_TTL_MS=300000

FEATURED_PRIMARY_ALIAS=prod

MULTILANG_ALL=true
MULTILANG_ENRICH_BATCH=100
MULTILANG_ENRICH_CONCURRENCY=5
STORE_CONCURRENCY=6
STORE_MAX_FOR_PRICE_ENRICH=500

VALIDATE_REQUESTS=false
VALIDATE_RESPONSES=false
ENABLE_DOCS=false

PAGE_SIZE=100
REVIEWS_ENABLED=true
REVIEWS_FETCH_COUNT=20

ENABLE_SALES_WATCHER=true
SALES_WATCH_INTERVAL_MS=30000
ENABLE_ITEM_WATCHER=true
ITEM_WATCH_INTERVAL_MS=30000
ITEM_WATCH_TOP=150
ITEM_WATCH_PAGES=3
ENABLE_PRICE_WATCHER=true
PRICE_WATCH_INTERVAL_MS=30000
PRICE_WATCH_MAX_STORES=50
ENABLE_TRENDING_WATCHER=true
TRENDING_INTERVAL_MS=60000
TRENDING_WINDOW_HOURS=24
TRENDING_PAGE_TOP=200
TRENDING_PAGES=3
TRENDING_TOP_N=20
SSE_HEARTBEAT_MS=15000

ADV_SEARCH_TTL_MS=60000
ADV_SEARCH_BATCH=300
ADV_SEARCH_MAX_BATCHES=10

WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_MAX_RETRIES=3
WEBHOOK_CONCURRENCY=4

MAX_SEARCH_BATCHES=10
MAX_FETCH_BATCHES=20
PLAYFAB_CONCURRENCY=12
PLAYFAB_BATCH=600

RATE_LIMIT_ENABLED=true
RATE_LIMIT_DEFAULT_WINDOW_MS=60000
RATE_LIMIT_DEFAULT_MAX=60

RATE_LIMIT_LOGIN_WINDOW_MS=900000
RATE_LIMIT_LOGIN_MAX=20

RATE_LIMIT_MARKETPLACE_WINDOW_MS=60000
RATE_LIMIT_MARKETPLACE_MAX=120

RATE_LIMIT_EVENTS_WINDOW_MS=60000
RATE_LIMIT_EVENTS_MAX=120

RATE_LIMIT_ADMIN_WINDOW_MS=60000
RATE_LIMIT_ADMIN_MAX=60

RATE_LIMIT_HEALTH_WINDOW_MS=10000
RATE_LIMIT_HEALTH_MAX=120
```

---

## Testing

* **Unit**: isolate pure helpers (`utils/pagination`, `utils/hash`, `services/advancedSearchService`).
* **Contract**: with `VALIDATE_REQUESTS=true`, focus on validator test cases and unified error shapes.
* **SSE**: simulate via `eventsource` and assert event names/payload shapes.
* **Webhooks**: spin up a local receiver and validate signature & retry semantics.

---

## Performance Tuning

* Increase `HTTP_MAX_SOCKETS` / `HTTPS_MAX_SOCKETS` for higher parallelism.
* Adjust `STORE_CONCURRENCY`, `ADV_SEARCH_BATCH`, and watcher intervals to respect upstream quotas.
* Use CDN in front; the API already sends ETags and cache directives.
* Prefer `page/pageSize` for stable pagination; `skip/limit` is supported for flexibility.
* Enable `LOG_LEVEL=debug` temporarily to inspect store/item volumes and discounts.

---

## Deployment

### Docker

**Dockerfile (example)**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","src/index.js"]
```

### docker-compose

```yaml
version: "3.8"
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment:
      PORT: 3000
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_USER: ${ADMIN_USER}
      ADMIN_PASS: ${ADMIN_PASS}
      ENABLE_DOCS: "true"
      LOG_LEVEL: "info"
    volumes:
      - ./src/data:/app/src/data
```

### Kubernetes (snippet)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: playfab-catalog-api }
spec:
  replicas: 2
  selector: { matchLabels: { app: playfab-catalog-api } }
  template:
    metadata: { labels: { app: playfab-catalog-api } }
    spec:
      containers:
        - name: api
          image: ghcr.io/org/playfab-catalog-api:latest
          ports: [{ containerPort: 3000 }]
          envFrom: [{ secretRef: { name: api-secrets } }]
          readinessProbe: { httpGet: { path: "/", port: 3000 }, initialDelaySeconds: 5, periodSeconds: 10 }
          livenessProbe:  { httpGet: { path: "/", port: 3000 }, initialDelaySeconds: 10, periodSeconds: 20 }
---
apiVersion: v1
kind: Service
metadata: { name: playfab-catalog-api }
spec:
  selector: { app: playfab-catalog-api }
  ports: [{ port: 80, targetPort: 3000 }]
```

### Reverse Proxy (Nginx)

```nginx
server {
  listen 80;
  server_name api.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s; # allow SSE
  }
}
```

---

## Observability & Ops

* **Traceability**: include `X-Request-Id` on requests; error payloads echo `traceId`.
* **SSE stability**: ensure proxy timeouts ≥ heartbeat; enable TCP keep-alive.
* **Disk**: persist `src/data/*.json` to retain titles, creators, and webhook registrations.
* **Metrics**: wrap winston logs with your log shipping/metrics pipeline.

---

## Troubleshooting

* **401/403**: Missing/invalid JWT or insufficient role.
* **404**:

  * `Alias '<alias>' not found.` → add to `titles.json`.
  * `Creator '<name>' not found.` → add to/verify `creators.json`.
  * Item not found → ensure correct alias/title and item id/friendly id.
* **Empty sales**: no stores returned or store items not resolvable; turn on `LOG_LEVEL=debug`.
* **429/5xx upstream**: the client already retries with jitter; consider lowering concurrency/intervals.
* **SSE disconnects**: check proxy idle timeout; heartbeats are at least 5s.

---

## FAQ

**How do I map aliases to TitleIds?**
Use `POST /titles` or edit `src/data/titles.json` and restart (hot reload reads mtime).

**What’s the difference between `resolve` and `friendly` routes?**
Both end up returning a fully enriched item; `friendly` uses a search by `alternateIds` first.

**Can I get facets for tags/creators?**
Yes — use **advanced search**; the response adds `facets.tags`, `facets.creators`, `facets.contentTypes`, and price buckets.

**Are images always present?**
Items are filtered by `isValidItem()` to ensure at least one image; thumbnails are prioritized in `Images`.

---

## Contributing

1. Fork and create a feature branch.
2. Add tests for your logic where applicable.
3. Keep code style consistent; prefer small, readable modules.
4. Update **README/OpenAPI** when you change public behavior.
5. Open a PR with a clear description and screenshots/logs for UX/API changes.

---

## License

This project integrates third-party services (PlayFab). Ensure compliance with your internal policies and the provider’s terms of use.
