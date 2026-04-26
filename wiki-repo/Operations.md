# Operations

> [!NOTE]
> This page is generated from repository source files. Last generated: 2026-04-26T19:30:40.019Z.
> Manual edits in the wiki may be overwritten by the next sync.

## Health

The health routes expose runtime, cache, watcher, docs, title, and configuration status. Use the generated [API Reference](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/wiki/API-Reference) for exact response schemas.

## Security Model

- JWT bearer authentication protects most endpoints.
- Admin-only routes require a token with `role: admin`.
- `/login`, `/openapi.json`, and optionally `/docs` are available without bearer enforcement.
- CORS is controlled by `CORS_ORIGINS`.
- OpenAPI request and response validation can be enabled for stricter runtime checks.

## Rate Limiting

The service has route-level limiters for login, marketplace, player marketplace, admin, and health traffic. Global and per-scope limit values can be overridden with `RATE_LIMIT_*` variables.

## Deployment Checklist

- Set `NODE_ENV=production`.
- Set a strong `JWT_SECRET`.
- Set admin credentials through deployment secrets.
- Review watcher toggles and intervals before enabling them in production.
- Review PlayFab and Minecraft upstream timeout, retry, batch, and concurrency settings.
- Configure reverse proxy trust with `TRUST_PROXY` when running behind a proxy.
- Keep `ENABLE_DOCS=false` unless Swagger UI should be publicly reachable.

## Wiki Automation

The `Sync GitHub Wiki` workflow runs on source, OpenAPI, package, and documentation changes on `main`. It generates pages with `npm run wiki:generate` and pushes them to `Daniel-Ric/PlayFab-Catalog-Service-Bedrock.wiki`.

Use `[skip wiki]` in a commit message to skip an automatic sync.
