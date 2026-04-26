# API Reference

> [!NOTE]
> This page is generated from repository source files. Last generated: 2026-04-26T19:30:40.019Z.
> Manual edits in the wiki may be overwritten by the next sync.

This page is generated from `src/docs/openapi-base.yaml` and all files in `src/docs/paths`. The source of truth for request and response validation remains the OpenAPI specification.

## Summary

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

## Creators

### GET /creators

Get all creators

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `page` (query)<br>`pageSize` (query)<br>`skip` (query)<br>`limit` (query) |
| Request body | - |
| Responses | `200` OK `array`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`500` Server error `Error` |

## Events

### GET /events/stream

Events stream (SSE)

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `events` (query)<br>`creatorName` (query)<br>`heartbeatMs` (query) |
| Request body | - |
| Responses | `200` Server-Sent Events stream `string`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`500` Server error `Error` |

## Health

### GET /health

Health and configuration status

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | - |
| Request body | - |
| Responses | `200` OK `object`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`500` Server error `Error` |

## Auth

### POST /login

Login to receive a JWT

| Property | Value |
| --- | --- |
| Authentication | Public |
| Parameters | - |
| Request body | `object` |
| Responses | `200` Successful login `object`<br>`401` Invalid credentials `Error` |

## Marketplace

### GET /marketplace/{creatorName}/stats

Get statistics for a creator

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `creatorName` (path, required)<br>`latestLimit` (query)<br>`topRatedLimit` (query)<br>`months` (query)<br>`includeLists` (query) |
| Request body | - |
| Responses | `200` OK `object`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/all/{alias}

Get all marketplace items

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`tag` (query)<br>`creatorName` (query)<br>`page` (query)<br>`pageSize` (query)<br>`skip` (query)<br>`limit` (query) |
| Request body | - |
| Responses | `200` OK `array`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/compare/{creatorName}

Compare items of a creator across titles

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `creatorName` (path, required) |
| Request body | - |
| Responses | `200` OK `object`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Creator not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/details/{alias}/{itemId}

Get item details by id

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`itemId` (path, required) |
| Request body | - |
| Responses | `200` OK `Item`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/featured-content

Get featured persona items

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | - |
| Request body | - |
| Responses | `200` OK `FeaturedPersona`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`500` Server error `Error` |

### GET /marketplace/featured-servers

Get featured servers

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | - |
| Request body | - |
| Responses | `200` OK `FeaturedServer`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`500` Server error `Error` |

### GET /marketplace/free/{alias}

Get free items

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`creatorName` (query)<br>`page` (query)<br>`pageSize` (query)<br>`skip` (query)<br>`limit` (query) |
| Request body | - |
| Responses | `200` OK `array`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/friendly/{alias}/{friendlyId}

Get item by friendly id

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`friendlyId` (path, required) |
| Request body | - |
| Responses | `200` OK `Item`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/latest/{alias}

Get latest marketplace items

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`count` (query)<br>`creatorName` (query)<br>`page` (query)<br>`pageSize` (query)<br>`skip` (query)<br>`limit` (query) |
| Request body | - |
| Responses | `200` OK `array`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/mc-token

Get MC token

| Property | Value |
| --- | --- |
| Authentication | Public |
| Parameters | - |
| Request body | - |
| Responses | `200` OK `object`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`500` Server error `Error` |

### POST /marketplace/player/search/{alias}

Search the player marketplace with entity tokens

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required) |
| Request body | `object` |
| Responses | `200` OK `array`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/popular/{alias}

Get popular items

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`creatorName` (query)<br>`page` (query)<br>`pageSize` (query)<br>`skip` (query)<br>`limit` (query) |
| Request body | - |
| Responses | `200` OK `array`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/recommendations/{itemId}

Get recommended items

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `itemId` (path, required)<br>`limit` (query) |
| Request body | - |
| Responses | `200` OK `object`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/resolve/{alias}/{itemId}

Resolve wrapper to real item by itemId

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`itemId` (path, required)<br>`depth` (query) |
| Request body | - |
| Responses | `200` OK `Item`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error` |

### GET /marketplace/resolve/friendly/{alias}/{friendlyId}

Resolve wrapper to real item by FriendlyId

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`friendlyId` (path, required)<br>`depth` (query) |
| Request body | - |
| Responses | `200` OK `Item`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error` |

### GET /marketplace/sales

Get current sales

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `creator` (query) |
| Request body | - |
| Responses | `200` OK `SalesOverview`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` No sales currently active `Error`<br>`500` Server error `Error` |

### GET /marketplace/sales/{alias}

Get current sales for a specific title

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`creator` (query) |
| Request body | - |
| Responses | `200` OK `SalesOverview`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` No sales currently active `Error`<br>`500` Server error `Error` |

### GET /marketplace/search/{alias}

Search items by creator and keyword

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`creatorName` (query, required)<br>`keyword` (query, required)<br>`page` (query)<br>`pageSize` (query)<br>`skip` (query)<br>`limit` (query)<br>`orderBy` (query) |
| Request body | - |
| Responses | `200` OK `array`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### POST /marketplace/search/advanced/{alias}

Advanced search

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`page` (query)<br>`pageSize` (query) |
| Request body | `AdvancedSearchRequest` |
| Responses | `200` OK `AdvancedSearchResponse`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`500` Server error `Error` |

### GET /marketplace/summary/{alias}

Get a summary of items

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`page` (query)<br>`pageSize` (query)<br>`skip` (query)<br>`limit` (query) |
| Request body | - |
| Responses | `200` OK `array`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

### GET /marketplace/tag/{alias}/{tag}

Get items by tag

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required)<br>`tag` (path, required)<br>`page` (query)<br>`pageSize` (query)<br>`skip` (query)<br>`limit` (query) |
| Request body | - |
| Responses | `200` OK `array`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

## Session

### GET /session/{alias}

Get a PlayFab session for a title alias

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required) |
| Request body | - |
| Responses | `200` OK `object`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

## Titles

### GET /titles

List all titles

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | - |
| Request body | - |
| Responses | `200` OK `array`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`500` Server error `Error` |

### POST /titles

Create a title

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | - |
| Request body | `Title` |
| Responses | `201` Created `Title`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error` |

### DELETE /titles/{alias}

Delete a title

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `alias` (path, required) |
| Request body | - |
| Responses | `200` OK `object`<br>`401` Unauthorized `Error`<br>`403` Forbidden `Error`<br>`404` Not found `Error`<br>`500` Server error `Error` |

## Admin

### GET /webhooks

List webhooks

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | - |
| Request body | - |
| Responses | `200` OK `array`<br>`401` Unauthorized `Error`<br>`403` Forbidden (admin only) `Error`<br>`500` Server error `Error` |

### POST /webhooks

Create webhook

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | - |
| Request body | `WebhookRegistration` |
| Responses | `201` Created `Webhook`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden (admin only) `Error`<br>`500` Server error `Error` |

### DELETE /webhooks/{id}

Delete webhook

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `id` (path, required) |
| Request body | - |
| Responses | `200` Deleted `object`<br>`401` Unauthorized `Error`<br>`403` Forbidden (admin only) `Error`<br>`404` Webhook not found `Error`<br>`500` Server error `Error` |

### GET /webhooks/{id}

Get webhook

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `id` (path, required) |
| Request body | - |
| Responses | `200` OK `Webhook`<br>`401` Unauthorized `Error`<br>`403` Forbidden (admin only) `Error`<br>`404` Webhook not found `Error`<br>`500` Server error `Error` |

### PATCH /webhooks/{id}

Update webhook

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `id` (path, required) |
| Request body | `object` |
| Responses | `200` OK `Webhook`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden (admin only) `Error`<br>`404` Webhook not found `Error`<br>`500` Server error `Error` |

### POST /webhooks/{id}/test

Test webhook delivery

| Property | Value |
| --- | --- |
| Authentication | Bearer JWT |
| Parameters | `id` (path, required) |
| Request body | - |
| Responses | `200` Test result `WebhookResult`<br>`400` Bad request `Error`<br>`401` Unauthorized `Error`<br>`403` Forbidden (admin only) `Error`<br>`404` Webhook not found `Error`<br>`500` Server error `Error` |
