# Getting Started

> [!NOTE]
> This page is generated from repository source files. Last generated: 2026-04-26T19:30:40.019Z.
> Manual edits in the wiki may be overwritten by the next sync.

## Requirements

- Node.js 22 is used by the repository automation.
- npm is used for dependency installation and scripts.
- A valid `JWT_SECRET` with at least 32 characters is required before the server starts.
- `ADMIN_USER` and `ADMIN_PASS` are required for `POST /login`.

## Install

```bash
git clone https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock.git
cd PlayFab-Catalog-Service-Bedrock
npm ci
```

## Configure

Run the interactive setup when creating a local environment:

```bash
npm run setup
```

The setup script writes the local environment file and initial data files. Do not commit secrets.

## Start

```bash
npm start
```

For development with automatic restart:

```bash
npm run dev
```

## Authenticate

Most endpoints require a bearer JWT. Request a token:

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<admin-user>","password":"<admin-password>"}'
```

Use the returned token:

```bash
curl http://localhost:3000/health \
  -H "Authorization: Bearer <token>"
```

## Local Documentation

The raw OpenAPI document is always available at `/openapi.json`. Swagger UI is served at `/docs` when `ENABLE_DOCS=true`.
