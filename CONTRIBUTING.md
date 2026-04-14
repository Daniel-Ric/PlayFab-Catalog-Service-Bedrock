# Contributing

Thank you for contributing to PlayFab-Catalog-Service-Bedrock.

This repository contains a Node.js/Express API for PlayFab Catalog marketplace data, event streaming, and related tooling. Contributions should preserve reliability, security, and API consistency.

## Before You Start

- Read [readme.md](readme.md) for architecture, configuration, and runtime behavior.
- Read [SECURITY.md](SECURITY.md) before reporting vulnerabilities.
- For larger features, behavioral changes, or breaking API updates, open an issue or start a discussion before investing significant implementation time.

## Development Setup

Requirements:

- Node.js 18 or newer
- npm

Install dependencies:

```bash
npm ci
```

Run the service locally:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Project scripts:

- `npm run setup` initializes local project setup helpers.
- `npm run dev` starts the server with `nodemon`.
- `npm start` starts the server normally.
- `npm test` runs the Node test suite.

## Repository Structure

- `src/index.js`: application bootstrap
- `src/routes`: HTTP route definitions
- `src/controllers`: request handlers
- `src/services`: PlayFab, watcher, SSE, and webhook logic
- `src/middleware`: Express middleware
- `src/utils`: shared helpers
- `src/docs`: OpenAPI source files
- `test`: Node-based test suite

## Contribution Guidelines

Please keep changes focused and production-minded.

- Prefer small pull requests with a single clear purpose.
- Do not mix unrelated refactors with bug fixes or features.
- Preserve existing API behavior unless the change is intentional and documented.
- Update OpenAPI files in `src/docs` when routes, payloads, parameters, or responses change.
- Add or update tests when fixing bugs or introducing behavior changes.
- Keep security-sensitive changes conservative, especially around auth, rate limiting, webhook handling, and outbound requests.
- Never commit secrets, tokens, or private environment values.

## Coding Expectations

- Match the existing CommonJS style used in the repository.
- Follow the current file organization and naming conventions.
- Keep functions readable and avoid broad rewrites unless necessary.
- Prefer explicit error handling over silent fallbacks.
- If a new configuration variable is required, document it in `readme.md`.

## Testing Expectations

At minimum, contributors should:

- run `npm test` locally before opening a pull request
- add tests for bug fixes and new logic where practical
- verify that documentation and OpenAPI descriptions still match the implementation

If you cannot add automated coverage for a change, explain the gap in the pull request.

## Commit Messages

This repository uses Release Please and expects Conventional Commit style messages.

Use commit prefixes such as:

- `feat:`
- `fix:`
- `perf:`
- `refactor:`
- `docs:`
- `test:`
- `ci:`
- `build:`
- `chore:`

Examples:

```text
feat: add validation for webhook registration targets
fix: prevent stale cache reuse in marketplace summary
docs: clarify JWT setup requirements
```

## Pull Requests

When opening a pull request:

- describe the problem and the intended fix clearly
- link the related issue if one exists
- summarize any API, config, or operational impact
- mention any follow-up work that is intentionally left out
- include test evidence, such as the commands you ran

Pull requests should be ready for review, with updated docs and tests where needed.

## Documentation Changes

Documentation-only contributions are welcome.

If you change behavior that affects users or operators, update the relevant sections in:

- `readme.md`
- `src/docs/**`
- `CHANGELOG.md` if a manual changelog update is appropriate

## Security Reporting

Do not use public issues or pull requests for sensitive vulnerability details. Follow the reporting process in [SECURITY.md](SECURITY.md).

## Conduct

By participating in this project, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
