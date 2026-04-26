# Architecture

> [!NOTE]
> This page is generated from repository source files. Last generated: 2026-04-26T19:30:40.019Z.
> Manual edits in the wiki may be overwritten by the next sync.

## Runtime Shape

The service is an Express application started from `src/index.js`. It configures security middleware, CORS, compression, JSON parsing, optional OpenAPI validation, JWT authentication, route-specific rate limiting, route mounting, and final error handling.

## Request Lifecycle

1. Helmet applies baseline HTTP security headers.
2. CORS checks the request origin against configured origins.
3. A request id is assigned from `x-request-id` or generated locally.
4. Optional debug request logging runs when log level is debug.
5. Compression is applied except for Server-Sent Events.
6. JSON body parsing runs with a bounded payload size.
7. JWT enforcement and role guards protect most routes.
8. Route-specific controllers call services and utilities.
9. Errors are normalized into the shared error response shape.

## Layers

- Routes in `src/routes` define HTTP surface area and delegate to controllers.
- Controllers in `src/controllers` parse input, call service functions, and build responses.
- Services in `src/services` contain marketplace aggregation, watchers, SSE hub, webhooks, and advanced search behavior.
- Utilities in `src/utils` contain PlayFab transport, filtering, projection, pagination, storage, hashing, CORS, and event payload helpers.
- OpenAPI files in `src/docs` define the machine-readable API contract.

## Caching

The project uses process-local caches for session data, general data, upstream PlayFab responses, item lookups, details, summaries, recommendations, stats, and advanced search results. HTTP responses also use cache headers on selected read endpoints.

## Background Watchers

When enabled, watchers start after the HTTP server begins listening. They publish events through the shared event bus, which can feed SSE clients and webhook delivery.

## External Systems

- PlayFab Catalog APIs are used for marketplace search, item lookup, stores, sessions, and enrichment.
- Minecraft service endpoints are used by featured servers, featured persona, and token-related flows.
- Webhook targets receive signed JSON payloads with retry and concurrency controls.
