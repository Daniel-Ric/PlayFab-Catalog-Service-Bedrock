# Development

> [!NOTE]
> This page is generated from repository source files. Last generated: 2026-04-26T19:30:40.019Z.
> Manual edits in the wiki may be overwritten by the next sync.

## npm Scripts

| Command | Runs |
| --- | --- |
| `npm run dev` | `nodemon src/index.js` |
| `npm run setup` | `node src/scripts/setup.js` |
| `npm run start` | `node src/index.js` |
| `npm run test` | `node src/scripts/run-node-tests.js` |
| `npm run wiki:generate` | `node .github/scripts/generate-wiki.js` |

## Tests

The test files under `test` cover marketplace token and filter utilities, event payloads, featured content watcher behavior, item watcher behavior, title handling, and webhook target logic.

```bash
npm test
```

## Generated Wiki

Generate the wiki locally:

```bash
npm run wiki:generate
```

Generated files are written to `build/wiki`. The GitHub Action publishes that directory into the repository wiki.

## Dependencies

| Dependency | Version |
| --- | --- |
| `async-mutex` | `^0.5.0` |
| `axios` | `^1.15.2` |
| `body-parser` | `^2.2.0` |
| `bottleneck` | `^2.19.5` |
| `chalk` | `^5.5.0` |
| `compression` | `^1.8.1` |
| `cors` | `^2.8.5` |
| `dotenv` | `^17.2.3` |
| `express` | `^5.1.0` |
| `express-openapi-validator` | `^5.5.8` |
| `express-rate-limit` | `^8.3.1` |
| `express-validator` | `^7.2.1` |
| `fast-json-stable-stringify` | `^2.1.0` |
| `helmet` | `^8.1.0` |
| `inquirer` | `^13.0.1` |
| `jsonwebtoken` | `^9.0.2` |
| `lru-cache` | `^11.2.2` |
| `node-cache` | `^5.1.2` |
| `prompts` | `^2.4.2` |
| `swagger-ui-express` | `^5.0.1` |
| `undici` | `^8.1.0` |
| `winston` | `^3.17.0` |
| `yamljs` | `^0.3.0` |
