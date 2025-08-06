# PlayFab Catalog Service (Bedrock)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)  [![GitHub Stars](https://img.shields.io/github/stars/Daniel-Ric/PlayFab---Catalog-Service-Bedrock?style=social)](https://github.com/Daniel-Ric/PlayFab---Catalog-Service-Bedrock)  [![GitHub Issues](https://img.shields.io/github/issues/Daniel-Ric/PlayFab---Catalog-Service-Bedrock)](https://github.com/Daniel-Ric/PlayFab---Catalog-Service-Bedrock/issues)  [![npm version](https://img.shields.io/npm/v/playfab-catalog-service)](https://www.npmjs.com/package/playfab-catalog-service)

> A robust Node.js/Express service powering View-MarketplaceNET by fetching, caching, and exposing PlayFab catalog data for Minecraft Bedrock.

---

## 📚 Table of Contents

* [✨ Highlights](#-highlights)
* [🚀 Quick Start](#-quick-start)
* [🔧 Configuration](#-configuration)
* [📂 Project Structure](#-project-structure)
* [💻 Usage Examples](#-usage-examples)
* [📖 API Reference](#-api-reference)
* [⚙️ Caching & Rate Limiting](#️-caching--rate-limiting)
* [📊 Logging & Monitoring](#-logging--monitoring)
* [🛡 Middleware Stack](#-middleware-stack)
* [🐳 Docker Support](#-docker-support)
* [🧪 Scripts](#-scripts)
* [🤝 Contributing](#-contributing)
* [❓ FAQ](#-faq)
* [📄 License](#-license)

---

## ✨ Highlights

* **Seamless PlayFab Integration**: Authenticate and query PlayFab Catalog (`Catalog/Search`, `Client/LoginWithIOSDeviceID`, `Authentication/GetEntityToken`).
* **Express Modularity**: Clean separation of routes/controllers for Titles, Creators, Session, and Marketplace sub-resources.
* **ETag Support & Conditional GET**: Automatic `ETag` generation with `If-None-Match` support for efficient bandwidth use.
* **In-Memory Caching**: `node-cache` stores sessions (configurable TTL) and marketplace data (default 5 min), minimizing redundant API calls.
* **Rate Limiting**: Protects against abuse with 2,000 requests/hour/IP, customizable via `express-rate-limit`.
* **Input Validation**: `express-validator` enforces parameter requirements and formats, returning structured error messages.
* **Structured Logging**: Winston + Chalk for leveled logs (console + JSON file output).
* **Parallel Fetching**: Efficiently retrieve large sets of catalog items in parallel batches.
* **Developer-Friendly**: Environment-driven configuration, Docker support, and a ready-to-go Postman collection.

---

## 🚀 Quick Start

1. **Clone & Install**

   ```bash
   git clone https://github.com/Daniel-Ric/PlayFab---Catalog-Service-Bedrock.git
   cd PlayFab---Catalog-Service-Bedrock
   npm install
   ```
2. **Configure**

   ```bash
   cp .env.example .env
   # Edit .env: PORT, SESSION_TTL_MS, OS, LOG_LEVEL
   ```
3. **Run**

   ```bash
   npm start       # Production mode
   npm run dev     # Development (nodemon)
   ```
4. **Explore API**: Visit `http://localhost:3000` or import `postman/collection.json`.

---

## 🔧 Configuration

Edit the `.env` file:

| Key              | Default   | Description                                   |
| ---------------- | --------- | --------------------------------------------- |
| `PORT`           | `3000`    | Service port                                  |
| `SESSION_TTL_MS` | `1800000` | Session cache TTL in ms (30 min default)      |
| `OS`             | `IOS`     | PlayFab OS identifier (IOS, Android, etc.)    |
| `LOG_LEVEL`      | `debug`   | Logging level (`debug`,`info`,`warn`,`error`) |

Core JSON configurations:

* `src/data/titles.json` — map aliases to PlayFab Title IDs.
* `src/data/creators.json` — list of marketplace creators.
* `src/config/featuredServers.js` — predefined server IDs/names.

---

## 📂 Project Structure

```
PlayFab---Catalog-Service-Bedrock/
├── src/
│   ├── config/        # Cache, rate limiter, logger setup
│   ├── controllers/   # Request handlers per feature
│   ├── data/          # JSON files: titles, creators
│   ├── middleware/    # ETag, request logger, validation
│   ├── routes/        # Express route definitions
│   ├── services/      # Business logic interacting with PlayFab
│   ├── utils/         # Helpers: PlayFab, filter, cache
│   └── index.js       # Entrypoint, middleware, mounts
├── postman/           # Postman collection & env
├── Dockerfile         # Docker build instructions
├── .env.example
├── LICENSE
├── README.md
└── package.json
```

---

## 💻 Usage Examples

### Fetch All Items

```bash
curl http://localhost:3000/marketplace/all/bedrock
```

### Search by Creator & Keyword

```bash
curl "http://localhost:3000/marketplace/search/bedrock?creatorName=4JStudios&keyword=castle"
```

### Get Session Info

```bash
curl http://localhost:3000/session/bedrock
```

Import `postman/collection.json` to test all endpoints interactively.

---

## 📖 API Reference

### Titles

| Method | Endpoint         | Description                                  |
| ------ | ---------------- | -------------------------------------------- |
| GET    | `/titles`        | List all title aliases & notes.              |
| POST   | `/titles`        | Create a new alias (`alias`, `id`, `notes`). |
| DELETE | `/titles/:alias` | Delete an existing alias.                    |

### Creators

| Method | Endpoint    | Description               |
| ------ | ----------- | ------------------------- |
| GET    | `/creators` | List configured creators. |

### Session

| Method | Endpoint          | Description                         |
| ------ | ----------------- | ----------------------------------- |
| GET    | `/session/:alias` | Obtain PlayFab session credentials. |

### Marketplace

| Route                          | Method | Query Params                | Description                                  |
| ------------------------------ | ------ | --------------------------- | -------------------------------------------- |
| `/all/:alias`                  | GET    | `?tag=`                     | All items (optional tag filter).             |
| `/latest/:alias`               | GET    | `?count=&creatorName=&tag=` | Latest N items (max 50).                     |
| `/popular/:alias`              | GET    | —                           | Top-rated items by review count.             |
| `/free/:alias`                 | GET    | —                           | Items with price = 0.                        |
| `/details/:alias/:itemId`      | GET    | —                           | Full details for one item.                   |
| `/friendly/:alias/:friendlyId` | GET    | —                           | Lookup by friendly ID.                       |
| `/tag/:alias/:tag`             | GET    | —                           | Items matching a tag.                        |
| `/search/:alias`               | GET    | `creatorName`, `keyword`    | Search catalog by creator & keyword.         |
| `/summary/:alias`              | GET    | —                           | Summarized items with client & details URLs. |
| `/compare/:creatorName`        | GET    | —                           | Compare a creator's items across titles.     |
| `/featured-servers`            | GET    | —                           | Predefined servers with screenshots.         |

All responses include `ETag` headers; clients sending `If-None-Match` may receive `304 Not Modified`.

---

## ⚙️ Caching & Rate Limiting

* **Session Cache**  — in-memory (`SESSION_TTL_MS`).
* **Data Cache**    — in-memory (5 min TTL).
* **Rate Limiter**  — 2,000 requests/hour/IP.

Customizable via config files and `.env` variables.

---

## 📊 Logging & Monitoring

* **Console** — colored output (timestamp, level, message).
* **File** — `catalog-service.log` in JSON format for `info`+ levels.
* **Log Level** — adjust via `LOG_LEVEL` environment variable.

---

## 🛡 Middleware Stack

1. **compression** (Gzip)
2. **body-parser** (JSON)
3. **cors** (default)
4. **express-rate-limit**
5. **requestLogger** (timing & debug)
6. **express-validator** (input checks)
7. **etag** (conditional GET)
8. **errorHandler** (uniform JSON errors)

---

## 🐳 Docker Support

Build and run:

```bash
docker build -t playfab-catalog-service .
docker run -d -p 3000:3000 --env-file .env playfab-catalog-service
```

---

## 🧪 Scripts

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "lint": "eslint .",
    "test": "jest",
    "postman": "newman run postman/collection.json"
  }
}
```

---

## 🤝 Contributing

1. Fork the repository 🔀
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "feat: description"`
4. Push branch: `git push origin feature/your-feature`
5. Open a Pull Request 📝

Please follow \[CONTRIBUTING.md] for guidelines and code style.

---

## ❓ FAQ

* **How to add a title alias?**
  POST to `/titles` with JSON `{ "alias": "bedrock", "id": "3BA5B", "notes": "..." }`.

* **Why am I seeing `304 Not Modified`?**
  Send `If-None-Match` header with last ETag to leverage caching.

* **Can I adjust cache TTLs?**
  Yes: modify `SESSION_TTL_MS` in `.env` and `dataCache` in `src/config/cache.js`.

---

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.
