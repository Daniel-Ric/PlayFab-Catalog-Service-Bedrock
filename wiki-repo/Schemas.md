# Schemas

> [!NOTE]
> This page is generated from repository source files. Last generated: 2026-04-26T19:30:40.019Z.
> Manual edits in the wiki may be overwritten by the next sync.

OpenAPI component schemas are loaded from `src/docs/schemas` and merged into the runtime OpenAPI document.

| Schema | Type | Required Fields | Properties |
| --- | --- | --- | --- |
| `AdvancedSearchRequest` | object | - | `query`, `filters`, `sort` |
| `AdvancedSearchResponse` | object | - | `items`, `meta`, `facets` |
| `Creator` | object | `creatorName`, `displayName` | `creatorName`, `displayName` |
| `Error` | object | `error` | `error` |
| `FeaturedPersona` | object | - | - |
| `FeaturedServer` | object | - | `count`, `items` |
| `Image` | object | `Id`, `Url` | `Id`, `Tag`, `Type`, `Url` |
| `Item` | object | `Id`, `Images` | `Id`, `Title`, `StartDate`, `Images`, `DisplayProperties` |
| `PaginatedItems` | object | - | `items`, `meta` |
| `PaginationMeta` | object | - | `total`, `page`, `pageSize`, `skip`, `limit`, `hasNext`, `nextPage`, `start`, `end` |
| `PriceAmount` | object | `currencyId`, `amount` | `currencyId`, `amount` |
| `Sale` | object | `id`, `items` | `id`, `catalogVersion`, `title`, `description`, `startDate`, `endDate`, `discountPercent`, `virtualCurrencyPrices`, `realCurrencyPrices`, `tags`, `platforms`, `items` |
| `SaleEvent` | object | - | `ts`, `changes` |
| `SaleItem` | object | `id`, `prices` | `id`, `prices`, `catalogVersion`, `customData`, `contentType`, `title`, `description`, `tags`, `platforms`, `keywords`, `images`, `virtualCurrencyPrices`, `realCurrencyPrices`, `rawItem` |
| `SalesOverview` | object | `totalItems`, `itemsPerCreator`, `sales` | `totalItems`, `itemsPerCreator`, `sales` |
| `Title` | object | `alias`, `id` | `alias`, `id`, `notes` |
| `Webhook` | object | `id`, `url`, `events`, `active`, `vendor` | `id`, `url`, `events`, `secret`, `active`, `vendor`, `filters`, `createdAt`, `updatedAt` |
| `WebhookRegistration` | object | `url` | `url`, `events`, `secret`, `vendor`, `active`, `filters` |
| `WebhookResult` | object | `id`, `status`, `ok`, `event` | `id`, `status`, `ok`, `event` |
