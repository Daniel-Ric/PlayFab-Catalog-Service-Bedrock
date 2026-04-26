# PlayFab Catalog Service Bedrock Wiki

> [!NOTE]
> This page is generated from repository source files. Last generated: 2026-04-26T19:30:40.019Z.
> Manual edits in the wiki may be overwritten by the next sync.

This wiki documents the PlayFab Catalog Service Bedrock repository in English. It is generated from the current source tree, OpenAPI specification, package metadata, tests, and runtime configuration references.

## Project Snapshot

| Field | Value |
| --- | --- |
| Package | `playfab-bedrock-catalog` |
| Version | `1.0.0` |
| Runtime | Node.js / CommonJS |
| Framework | Express |
| OpenAPI | PlayFab Service \| VMC API `1.1.0` |
| Repository | https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock |

## Main Areas

- [Getting Started](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/Getting-Started) explains installation, local startup, authentication, and first requests.
- [Configuration](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/Configuration) lists runtime environment variables discovered in source code.
- [Architecture](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/Architecture) describes the application layers, request lifecycle, caching, watchers, and external integrations.
- [API Reference](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/API-Reference) is generated from the OpenAPI path files.
- [Schemas](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/Schemas) summarizes OpenAPI component schemas.
- [Events and Webhooks](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/Events-and-Webhooks) covers SSE, internal event flow, webhook registration, and delivery behavior.
- [Operations](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/Operations) covers deployment, security, rate limits, observability, and maintenance.
- [Development](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/Development) covers scripts, tests, and contribution workflow.
- [Repository Inventory](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/Repository-Inventory) lists the generated module inventory.

## Endpoint Overview

| Method | Path | Tags | Summary | Auth |
| --- | --- | --- | --- | --- |
| GET | `/creators` | Creators | Get all creators | BearerAuth |
| GET | `/events/stream` | Events | Events stream (SSE) | BearerAuth |
| GET | `/health` | Health | Health and configuration status | BearerAuth |
| POST | `/login` | Auth | Login to receive a JWT | Public |
| GET | `/marketplace/{creatorName}/stats` | Marketplace | Get statistics for a creator | BearerAuth |
| GET | `/marketplace/all/{alias}` | Marketplace | Get all marketplace items | BearerAuth |
| GET | `/marketplace/compare/{creatorName}` | Marketplace | Compare items of a creator across titles | BearerAuth |
| GET | `/marketplace/details/{alias}/{itemId}` | Marketplace | Get item details by id | BearerAuth |
| GET | `/marketplace/featured-content` | Marketplace | Get featured persona items | BearerAuth |
| GET | `/marketplace/featured-servers` | Marketplace | Get featured servers | BearerAuth |
| GET | `/marketplace/free/{alias}` | Marketplace | Get free items | BearerAuth |
| GET | `/marketplace/friendly/{alias}/{friendlyId}` | Marketplace | Get item by friendly id | BearerAuth |
| GET | `/marketplace/latest/{alias}` | Marketplace | Get latest marketplace items | BearerAuth |
| GET | `/marketplace/mc-token` | Marketplace | Get MC token | Public |
| POST | `/marketplace/player/search/{alias}` | Marketplace | Search the player marketplace with entity tokens | BearerAuth |
| GET | `/marketplace/popular/{alias}` | Marketplace | Get popular items | BearerAuth |
| GET | `/marketplace/recommendations/{itemId}` | Marketplace | Get recommended items | BearerAuth |
| GET | `/marketplace/resolve/{alias}/{itemId}` | Marketplace | Resolve wrapper to real item by itemId | BearerAuth |
| GET | `/marketplace/resolve/friendly/{alias}/{friendlyId}` | Marketplace | Resolve wrapper to real item by FriendlyId | BearerAuth |
| GET | `/marketplace/sales` | Marketplace | Get current sales | BearerAuth |
| GET | `/marketplace/sales/{alias}` | Marketplace | Get current sales for a specific title | BearerAuth |
| GET | `/marketplace/search/{alias}` | Marketplace | Search items by creator and keyword | BearerAuth |
| POST | `/marketplace/search/advanced/{alias}` | Marketplace | Advanced search | BearerAuth |
| GET | `/marketplace/summary/{alias}` | Marketplace | Get a summary of items | BearerAuth |
| GET | `/marketplace/tag/{alias}/{tag}` | Marketplace | Get items by tag | BearerAuth |
| GET | `/session/{alias}` | Session | Get a PlayFab session for a title alias | BearerAuth |
| GET | `/titles` | Titles | List all titles | BearerAuth |
| POST | `/titles` | Titles | Create a title | BearerAuth |
| DELETE | `/titles/{alias}` | Titles | Delete a title | BearerAuth |
| GET | `/webhooks` | Admin | List webhooks | BearerAuth |
| POST | `/webhooks` | Admin | Create webhook | BearerAuth |
| DELETE | `/webhooks/{id}` | Admin | Delete webhook | BearerAuth |
| GET | `/webhooks/{id}` | Admin | Get webhook | BearerAuth |
| PATCH | `/webhooks/{id}` | Admin | Update webhook | BearerAuth |
| POST | `/webhooks/{id}/test` | Admin | Test webhook delivery | BearerAuth |
