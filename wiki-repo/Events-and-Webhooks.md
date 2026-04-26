# Events and Webhooks

> [!NOTE]
> This page is generated from repository source files. Last generated: 2026-04-26T19:30:40.019Z.
> Manual edits in the wiki may be overwritten by the next sync.

## Event Flow

Background services publish normalized events to the shared event bus. The SSE hub streams those events to connected clients, and the webhook dispatcher delivers matching events to registered webhook targets.

## Server-Sent Events

The SSE HTTP surface is documented in [API Reference](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/API-Reference) under the Events tag. SSE responses are not compressed and send heartbeats based on `SSE_HEARTBEAT_MS`.

## Watcher Sources

- Sales watcher emits sale-related changes.
- Item watcher emits item lifecycle and content changes.
- Price watcher emits price signature changes.
- Trending watcher emits trending creator data.
- Featured content watcher emits featured content updates.

## Webhook Management

Webhook routes are protected by admin authorization. Registered targets can define URL, active state, vendor, events, filters, and optional signing secret.

## Delivery Behavior

Webhook dispatch is controlled by `WEBHOOK_CONCURRENCY`, `WEBHOOK_MAX_RETRIES`, `WEBHOOK_TIMEOUT_MS`, `WEBHOOK_QUEUE_MAX`, `WEBHOOK_RETRY_BASE_MS`, and `WEBHOOK_RETRY_MAX_MS`. Payload signatures use the configured webhook secret when present.
