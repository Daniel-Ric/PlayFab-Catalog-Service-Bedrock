# Changelog

## 8.2.1 (2026-05-20)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Track created notification state for item watcher (12db308)
- Impact: Test coverage with a small change footprint across application logic, test coverage.
- Bump reason: patch-level repository update

### Changed Areas

- Service layer: 1 file: src/services/itemWatcher.js
- Tests: 1 file: test/itemWatcher.test.js

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +99 / -20
## 8.2.0 (2026-05-18)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Add Catalog Bridge with proxy and secure routes (69db005)
- Impact: Test coverage with a medium change footprint across project dependencies, repository files, application logic.
- Bump reason: medium change footprint (8 files, 694 total line changes)

### Changed Areas

- API routes: 1 file: src/routes/catalogBridge.js
- Application source: 2 files: src/index.js, src/scripts/generate-bridge-token.js
- Dependencies: 1 file: package.json
- README: 1 file: readme.md
- Runtime configuration: 1 file: src/config/catalogBridge.js
- Service layer: 1 file: src/services/catalogBridgeService.js
- Other areas: 1 additional group.

### Release Metrics

- Version bump: minor
- Files changed: 8
- Line changes: +694 / -0
## 8.1.3 (2026-05-13)

### Summary

- Change type: Repository update
- Main change: Bump inquirer from 13.4.2 to 13.4.3 (5d66a86)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 2 files: package-lock.json, package.json

### Notable Changes

- Bumps [inquirer](https://github.com/SBoudrias/Inquirer.js) from 13.4.2 to 13.4.3.
- [Release notes](https://github.com/SBoudrias/Inquirer.js/releases)
- [Commits](https://github.com/SBoudrias/Inquirer.js/compare/inquirer@13.4.2...inquirer@13.4.3)
- --

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +63 / -63

## 8.1.4 (2026-05-13)

### Summary

- Change type: Repository update
- Main change: Merge (242873f)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 2 files: package-lock.json, package.json

### Notable Changes

- Bump inquirer from 13.4.2 to 13.4.3

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +63 / -63
## 8.1.0 (2026-05-12)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Add date range splitting, deduplication, and streaming support (bc2d39e)
- Impact: Test coverage with a medium change footprint across repository files, application logic, test coverage.
- Bump reason: medium change footprint (5 files, 216 total line changes)

### Changed Areas

- Application source: 1 file: src/middleware/etag.js
- Repository files: 1 file: .env
- Service layer: 1 file: src/services/marketplaceService.js
- Tests: 2 files: test/etag.test.js, test/marketplaceFilters.test.js

### Release Metrics

- Version bump: minor
- Files changed: 5
- Line changes: +211 / -5
## 8.0.2 (2026-05-11)

### Summary

- Change type: Repository update
- Main change: PlayFab - Add docs + Postman for Marketplace Pass/Realms Plus (dfdcced)
- Impact: Repository update with a small change footprint across repository files.
- Bump reason: patch-level repository update

### Changed Areas

- Postman collection: 1 file: PlayFab Service - VMC.postman_collection.json
- README: 1 file: readme.md

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +155 / -2

## 8.0.3 (2026-05-11)

### Summary

- Change type: Repository update
- Main change: Merge remote-tracking branch 'origin/main' (f858f51)
- Impact: Repository update with a small change footprint across repository files.
- Bump reason: patch-level repository update

### Changed Areas

- Changelog: 1 file: CHANGELOG.md

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +44 / -0
## 8.0.0 (2026-05-11)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Add subscription watcher and Realms Plus/Marketplace Pass handling (c6f4848)
- Impact: Test coverage with a large change footprint across application logic, test coverage.
- Bump reason: large change footprint (10 files, 786 total line changes)

### Changed Areas

- API controllers: 1 file: src/controllers/marketplace/subscriptionsController.js
- API routes: 1 file: src/routes/marketplace/subscriptions.js
- Application source: 1 file: src/index.js
- OpenAPI documentation: 1 file: src/docs/paths/marketplace.subscriptions.yaml
- Runtime configuration: 1 file: src/config/eventNames.js
- Service layer: 2 files: src/services/marketplaceService.js, src/services/subscriptionWatcher.js
- Other areas: 2 additional groups.

### Release Metrics

- Version bump: major
- Files changed: 10
- Line changes: +785 / -1

## 8.0.1 (2026-05-11)

### Summary

- Change type: Repository update
- Main change: Merge remote-tracking branch 'origin/main' (eef806e)
- Impact: Repository update with a small change footprint across repository files.
- Bump reason: patch-level repository update

### Changed Areas

- Changelog: 1 file: CHANGELOG.md

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +20 / -0
## 7.3.1 (2026-05-11)

### Summary

- Change type: Repository update
- Main change: PlayFab - Extend Creator/Partner Watcher and update related configurations (a0b2849)
- Impact: Repository update with a small change footprint across repository files.
- Bump reason: patch-level repository update

### Changed Areas

- Postman collection: 1 file: PlayFab Service - VMC.postman_collection.json
- README: 1 file: readme.md

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +16 / -6
## 7.2.16 (2026-05-11)

### Summary

- Change type: Repository update
- Main change: Bump fast-uri from 3.1.0 to 3.1.2 (b02c6fb)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 1 file: package-lock.json

### Notable Changes

- Bumps [fast-uri](https://github.com/fastify/fast-uri) from 3.1.0 to 3.1.2.
- [Release notes](https://github.com/fastify/fast-uri/releases)
- [Commits](https://github.com/fastify/fast-uri/compare/v3.1.0...v3.1.2)
- --

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +3 / -3

## 7.2.17 (2026-05-11)

### Summary

- Change type: Repository update
- Main change: Merge (21313eb)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 1 file: package-lock.json

### Notable Changes

- Bump fast-uri from 3.1.0 to 3.1.2

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +3 / -3
## 7.2.14 (2026-05-11)

### Summary

- Change type: CI and automation
- Main change: PlayFab - Add FUNDING.yml to define funding (381e77a)
- Impact: CI and automation with a small change footprint across CI and workflow automation.
- Bump reason: patch-level repository update

### Changed Areas

- GitHub configuration: 1 file: .github/FUNDING.yml

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +4 / -0

## 7.2.15 (2026-05-11)

### Summary

- Change type: Repository update
- Main change: Merge remote-tracking branch 'origin/main' (662a911)
- Impact: Repository update with a small change footprint across repository files.
- Bump reason: patch-level repository update

### Changed Areas

- Changelog: 1 file: CHANGELOG.md

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +20 / -0
## 7.2.13 (2026-05-11)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Add item watcher state persistence and improve change detection (698d642)
- Impact: Test coverage with a small change footprint across application logic, test coverage.
- Bump reason: patch-level repository update

### Changed Areas

- Service layer: 1 file: src/services/itemWatcher.js
- Tests: 1 file: test/itemWatcher.test.js

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +145 / -3
## 7.2.12 (2026-05-08)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Update default marketplace ordering to `startDate desc` (756f774)
- Impact: Test coverage with a small change footprint across application logic, test coverage.
- Bump reason: patch-level repository update

### Changed Areas

- Service layer: 1 file: src/services/marketplaceService.js
- Tests: 1 file: test/marketplaceFilters.test.js

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +8 / -2
## 7.2.10 (2026-05-07)

### Summary

- Change type: Repository update
- Main change: PlayFab - Disable `creatorName` by default, update search descriptions (da96a91)
- Impact: Repository update with a small change footprint across repository files.
- Bump reason: patch-level repository update

### Changed Areas

- Postman collection: 1 file: PlayFab Service - VMC.postman_collection.json

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +6 / -4

## 7.2.11 (2026-05-07)

### Summary

- Change type: Repository update
- Main change: Merge remote-tracking branch 'origin/main' (d486df4)
- Impact: Repository update with a small change footprint across repository files.
- Bump reason: patch-level repository update

### Changed Areas

- Changelog: 1 file: CHANGELOG.md

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +23 / -0
## 7.2.9 (2026-05-07)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Add basic keyword sanitization, update search validation and schema (23cb596)
- Impact: Test coverage with a small change footprint across repository files, application logic, test coverage.
- Bump reason: patch-level repository update

### Changed Areas

- API routes: 1 file: src/routes/marketplace/search.js
- OpenAPI documentation: 1 file: src/docs/paths/marketplace.search.yaml
- README: 1 file: readme.md
- Service layer: 1 file: src/services/marketplaceService.js
- Tests: 1 file: test/marketplaceFilters.test.js

### Release Metrics

- Version bump: patch
- Files changed: 5
- Line changes: +34 / -8
## 7.2.7 (2026-05-06)

### Summary

- Change type: Repository update
- Main change: Bump undici from 8.1.0 to 8.2.0 (38c8dbb)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 2 files: package-lock.json, package.json

### Notable Changes

- Bumps [undici](https://github.com/nodejs/undici) from 8.1.0 to 8.2.0.
- [Release notes](https://github.com/nodejs/undici/releases)
- [Commits](https://github.com/nodejs/undici/compare/v8.1.0...v8.2.0)
- --

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +5 / -5

## 7.2.8 (2026-05-06)

### Summary

- Change type: Repository update
- Main change: Merge (7189db6)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 2 files: package-lock.json, package.json

### Notable Changes

- Bump undici from 8.1.0 to 8.2.0

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +5 / -5
## 7.2.6 (2026-05-06)

### Summary

- Change type: Repository update
- Main change: PlayFab - Patch transitive ip-address dependency advisory (b7e8b4d)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 2 files: package-lock.json, package.json

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +13 / -8
## 7.2.4 (2026-05-06)

### Summary

- Change type: Repository update
- Main change: Bump axios from 1.15.2 to 1.16.0 (d036121)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 2 files: package-lock.json, package.json

### Notable Changes

- Bumps [axios](https://github.com/axios/axios) from 1.15.2 to 1.16.0.
- [Release notes](https://github.com/axios/axios/releases)
- [Changelog](https://github.com/axios/axios/blob/v1.x/CHANGELOG.md)
- [Commits](https://github.com/axios/axios/compare/v1.15.2...v1.16.0)

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +6 / -6

## 7.2.5 (2026-05-06)

### Summary

- Change type: Repository update
- Main change: Merge (767c542)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 2 files: package-lock.json, package.json

### Notable Changes

- Bump axios from 1.15.2 to 1.16.0

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +6 / -6
## 7.2.1 (2026-05-04)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Extend item watcher with `createdLookbackMs` to change detection logic (5c0fbfc)
- Impact: Test coverage with a small change footprint across repository files, application logic, test coverage.
- Bump reason: patch-level repository update

### Changed Areas

- Application source: 1 file: src/scripts/setup.js
- README: 1 file: readme.md
- Repository files: 1 file: .env
- Service layer: 1 file: src/services/itemWatcher.js
- Tests: 1 file: test/itemWatcher.test.js

### Release Metrics

- Version bump: patch
- Files changed: 5
- Line changes: +57 / -8
## 7.0.3 (2026-05-04)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Fix item watcher pagination (9bac780)
- Impact: Test coverage with a small change footprint across application logic, test coverage.
- Bump reason: patch-level repository update

### Changed Areas

- Service layer: 1 file: src/services/itemWatcher.js
- Tests: 1 file: test/itemWatcher.test.js

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +51 / -22

## 7.0.4 (2026-05-04)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Limit item watcher fallback scans (9ea22dd)
- Impact: Test coverage with a small change footprint across application logic, test coverage.
- Bump reason: patch-level repository update

### Changed Areas

- Service layer: 1 file: src/services/itemWatcher.js
- Tests: 1 file: test/itemWatcher.test.js

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +47 / -20

## 7.0.5 (2026-05-04)

### Summary

- Change type: Repository update
- Main change: PlayFab - Extend item watcher to track content and detect changes (64a0c38)
- Impact: Repository update with a small change footprint across application logic.
- Bump reason: patch-level repository update

### Changed Areas

- Service layer: 1 file: src/services/featuredContentWatcher.js

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +14 / -2

## 7.0.6 (2026-05-04)

### Summary

- Change type: Repository update
- Main change: PlayFab - Extend item watcher to track content signature changes (ed7b27a)
- Impact: Repository update with a small change footprint across application logic.
- Bump reason: patch-level repository update

### Changed Areas

- Service layer: 1 file: src/services/featuredContentWatcher.js

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +9 / -1

## 7.0.7 (2026-05-04)

### Summary

- Change type: Repository update
- Main change: PlayFab - Add content signature generation and change detection (e91e8aa)
- Impact: Repository update with a small change footprint across application logic.
- Bump reason: patch-level repository update

### Changed Areas

- Service layer: 1 file: src/services/featuredContentWatcher.js

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +31 / -0

## 7.0.8 (2026-05-04)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Add tests for content signature changes and change payload detection (7824fb5)
- Impact: Test coverage with a small change footprint across test coverage.
- Bump reason: patch-level repository update

### Changed Areas

- Tests: 1 file: test/featuredContentWatcher.test.js

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +41 / -0

## 7.0.9 (2026-05-04)

### Summary

- Change type: Repository update
- Main change: PlayFab - Update readme to include `changedItems` and content change detection details (3b7cef3)
- Impact: Repository update with a small change footprint across repository files.
- Bump reason: patch-level repository update

### Changed Areas

- README: 1 file: readme.md

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +1 / -1

## 7.0.10 (2026-05-04)

### Summary

- Change type: Repository update
- Main change: PlayFab - Export `featuredContentSignature` from featuredContentWatcher (0f179ff)
- Impact: Repository update with a small change footprint across application logic.
- Bump reason: patch-level repository update

### Changed Areas

- Service layer: 1 file: src/services/featuredContentWatcher.js

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +1 / -0

## 7.1.0 (2026-05-04)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Add support for `contentType` filters across search APIs, update validation, schema, and tests (69fb1ed)
- Impact: Test coverage with a medium change footprint across repository files, application logic, test coverage.
- Bump reason: medium change footprint (13 files, 146 total line changes)

### Changed Areas

- API routes: 3 files: src/routes/marketplace/player-search.js, src/routes/marketplace/search-advanced.js, plus 1 more
- OpenAPI documentation: 4 files: src/docs/openapi-base.yaml, src/docs/paths/marketplace.player-search.yaml, plus 2 more
- Postman collection: 1 file: PlayFab Service - VMC.postman_collection.json
- README: 1 file: readme.md
- Service layer: 2 files: src/services/advancedSearchService.js, src/services/marketplaceService.js
- Shared utilities: 1 file: src/utils/filter.js
- Other areas: 1 additional group.

### Release Metrics

- Version bump: minor
- Files changed: 13
- Line changes: +129 / -17

## 7.2.0 (2026-05-04)

### Summary

- Change type: Test coverage
- Main change: Merge (9348a75)
- Impact: Test coverage with a medium change footprint across repository files, application logic, test coverage.
- Bump reason: medium change footprint (17 files, 381 total line changes)

### Changed Areas

- API routes: 3 files: src/routes/marketplace/player-search.js, src/routes/marketplace/search-advanced.js, plus 1 more
- OpenAPI documentation: 4 files: src/docs/openapi-base.yaml, src/docs/paths/marketplace.player-search.yaml, plus 2 more
- Postman collection: 1 file: PlayFab Service - VMC.postman_collection.json
- README: 1 file: readme.md
- Service layer: 4 files: src/services/advancedSearchService.js, src/services/featuredContentWatcher.js, plus 2 more
- Shared utilities: 1 file: src/utils/filter.js
- Other areas: 1 additional group.

### Notable Changes

- Fix catalog watcher pagination and add search contentType filters

### Release Metrics

- Version bump: minor
- Files changed: 17
- Line changes: +321 / -60
## 7.0.1 (2026-04-29)

### Summary

- Change type: Repository update
- Main change: Bump express-rate-limit from 8.3.2 to 8.4.1 (b3ac03b)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 2 files: package-lock.json, package.json

### Notable Changes

- Bumps [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) from 8.3.2 to 8.4.1.
- [Release notes](https://github.com/express-rate-limit/express-rate-limit/releases)
- [Commits](https://github.com/express-rate-limit/express-rate-limit/compare/v8.3.2...v8.4.1)
- --

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +5 / -5

## 7.0.2 (2026-04-29)

### Summary

- Change type: Repository update
- Main change: Merge (fc4c4b7)
- Impact: Repository update with a small change footprint across project dependencies.
- Bump reason: patch-level repository update

### Changed Areas

- Dependencies: 2 files: package-lock.json, package.json

### Notable Changes

- Bump express-rate-limit from 8.3.2 to 8.4.1

### Release Metrics

- Version bump: patch
- Files changed: 2
- Line changes: +5 / -5
## 7.0.0 (2026-04-29)

### Summary

- Change type: Test coverage
- Main change: PlayFab - Add date filters, update API endpoints (7537022)
- Impact: Test coverage with a large change footprint across repository files, application logic, test coverage.
- Bump reason: large change footprint (31 files, 1351 total line changes)

### Changed Areas

- API controllers: 3 files: src/controllers/marketplace/compareController.js, src/controllers/marketplace/recommendationsController.js, plus 1 more
- API routes: 12 files: src/routes/marketplace/all.js, src/routes/marketplace/compare.js, plus 10 more
- OpenAPI documentation: 11 files: src/docs/paths/marketplace.all.yaml, src/docs/paths/marketplace.compare.yaml, plus 9 more
- Postman collection: 1 file: PlayFab Service - VMC.postman_collection.json
- README: 1 file: readme.md
- Service layer: 1 file: src/services/marketplaceService.js
- Other areas: 2 additional groups.

### Release Metrics

- Version bump: major
- Files changed: 31
- Line changes: +1323 / -28
## 6.1.1 (2026-04-28)

### Summary

- Change type: Repository update
- Main change: PlayFab - Add new creators and remove inactive ones (auto update) (aa4ff29)
- Impact: Repository update with a small change footprint across application logic.
- Bump reason: patch-level repository update

### Changed Areas

- Application source: 1 file: src/data/creators.json

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +20 / -25

## 6.1.2 (2026-04-28)

### Summary

- Change type: Repository update
- Main change: Merge remote-tracking branch 'origin/main' (1dc96bf)
- Impact: Repository update with a small change footprint across repository files.
- Bump reason: patch-level repository update

### Changed Areas

- Changelog: 1 file: CHANGELOG.md

### Release Metrics

- Version bump: patch
- Files changed: 1
- Line changes: +19 / -0
## 6.1.0 (2026-04-27)

### Summary

- Change type: CI and automation
- Main change: PlayFab - Refactor release scripts for improved automation (096044d)
- Impact: CI and automation with a medium change footprint across CI and workflow automation.
- Bump reason: medium change footprint (1 files, 276 total line changes)

### Changed Areas

- GitHub automation scripts: 1 file: .github/scripts/create-version-release.js

### Release Metrics

- Version bump: minor
- Files changed: 1
- Line changes: +262 / -14
## 6.0.0 (2026-04-27)

### Summary

- PlayFab - Revise Postman collection structure and naming (43a4d53)
- Version bump: major
- Files changed: 1
- Line changes: +1780 / -1320
- Scope: This release mainly updates repository files.

## 6.0.1 (2026-04-27)

### Summary

- Merge remote-tracking branch 'origin/main' (4e71b22)
- Version bump: patch
- Files changed: 1
- Line changes: +10 / -0
- Scope: This release mainly updates repository files.
## 5.1.2 (2026-04-27)

### Summary

- PlayFab - Update .gitignore to exclude qodana.yaml (7172c67)
- Version bump: patch
- Files changed: 1
- Line changes: +1 / -0
- Scope: This release mainly updates repository files.
## 5.1.0 (2026-04-26)

### Summary

- PlayFab - Enhance GitHub Wiki generation script (c5d0aff)
- Version bump: minor
- Files changed: 1
- Line changes: +230 / -6
- Scope: This release mainly updates CI and workflow automation.

## 5.1.1 (2026-04-26)

### Summary

- Merge remote-tracking branch 'origin/main' (0c1685a)
- Version bump: patch
- Files changed: 1
- Line changes: +20 / -0
- Scope: This release mainly updates repository files.
## 5.0.1 (2026-04-26)

### Summary

- PlayFab - Simplify GitHub Wiki sync workflow (9347e85)
- Version bump: patch
- Files changed: 1
- Line changes: +9 / -9
- Scope: This release mainly updates CI and workflow automation.

## 5.0.2 (2026-04-26)

### Summary

- Merge remote-tracking branch 'origin/main' (930e555)
- Version bump: patch
- Files changed: 1
- Line changes: +20 / -0
- Scope: This release mainly updates repository files.
## 4.0.1 (2026-04-26)

### Summary

- PlayFab - Update GitHub Wiki sync and ignore files (b828bc9)
- Version bump: patch
- Files changed: 2
- Line changes: +9 / -6
- Scope: This release mainly updates CI and workflow automation, repository files.

## 5.0.0 (2026-04-26)

### Summary

- Merge remote-tracking branch 'origin/main' (f2e4089)
- Version bump: major
- Files changed: 12
- Line changes: +30 / -1085
- Scope: This release mainly updates repository files.
## 4.0.0 (2026-04-26)

### Summary

- Delete wiki-repo directory (43cfd0d)
- Version bump: major
- Files changed: 11
- Line changes: +0 / -1085
- Scope: This release mainly updates repository files.
## 2.2.1 (2026-04-26)

### Summary

- PlayFab - Handle non-fast-forward errors during changelog push (4e193c6)
- Version bump: patch
- Files changed: 2
- Line changes: +15 / -3
- Scope: This release mainly updates CI and workflow automation.

## 3.0.0 (2026-04-26)

### Summary

- Merge remote-tracking branch 'origin/main' (676d357)
- Version bump: major
- Files changed: 11
- Line changes: +1085 / -0
- Scope: This release mainly updates repository files.
## 2.1.2 (2026-04-24)

### Summary

- PlayFab - Add featured content watcher configuration (0e100a1)
- Version bump: patch
- Files changed: 1
- Line changes: +6 / -1
- Scope: This release mainly updates repository files.

## 2.1.3 (2026-04-24)

### Summary

- Merge remote-tracking branch 'origin/main' (2bbf109)
- Version bump: patch
- Files changed: 1
- Line changes: +30 / -0
- Scope: This release mainly updates repository files.
## 2.0.6 (2026-04-24)

### Summary

- PlayFab - Add creator parsing for featured content updates (d54761f)
- Version bump: patch
- Files changed: 2
- Line changes: +52 / -1
- Scope: This release mainly updates application logic, test coverage.

## 2.1.0 (2026-04-24)

### Summary

- PlayFab - Refactor featured content watcher and add tests (852dc25)
- Version bump: minor
- Files changed: 2
- Line changes: +340 / -20
- Scope: This release mainly updates application logic, test coverage.

## 2.1.1 (2026-04-24)

### Summary

- Merge remote-tracking branch 'origin/main' (d0e47a5)
- Version bump: patch
- Files changed: 3
- Line changes: +51 / -11
- Scope: This release mainly updates repository files, project dependencies.
## 2.0.4 (2026-04-23)

### Summary

- Bump axios from 1.15.1 to 1.15.2 (ca9f65f)
- Version bump: patch
- Files changed: 2
- Line changes: +5 / -5
- Scope: This release mainly updates project dependencies.

## 2.0.5 (2026-04-23)

### Summary

- Merge (a5aca7a)
- Version bump: patch
- Files changed: 2
- Line changes: +5 / -5
- Scope: This release mainly updates project dependencies.
## 2.0.0 (2026-04-23)

### Summary

- PlayFab - Add project disclaimers to all code files that were missing them (5d7c478)
- Version bump: major
- Files changed: 52
- Line changes: +683 / -0
- Scope: This release mainly updates application logic, test coverage.

## 2.0.1 (2026-04-23)

### Summary

- Merge remote-tracking branch 'origin/main' (87ddd01)
- Version bump: patch
- Files changed: 1
- Line changes: +10 / -0
- Scope: This release mainly updates repository files.
## 1.1.0 (2026-04-23)

### Summary

- PlayFab - Add tests for webhook validation and itemWatcher (8a3e7d3)
- Version bump: minor
- Files changed: 2
- Line changes: +237 / -0
- Scope: This release mainly updates test coverage.
## 1.0.3 (2026-04-21)

### Summary

- PlayFab - Add changelog generation and auto-update logic (7188f60)
- Version bump: patch
- Files changed: 2
- Line changes: +86 / -0
- Scope: This release mainly updates CI and workflow automation.
## 1.0.0 (2026-03-02)


### Bug Fixes

* harden item watcher created/updated SSE classification ([a54a42a](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/commit/a54a42a90e6da651fa8cee3ab2d4ab633de428af))
* harden item watcher created/updated SSE classification ([7482a82](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/commit/7482a82ed29a7866021d72cf1b7c63c24a69c7cb))


### Performance Improvements

* parallelize detail enrichment API calls ([1550f5c](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/commit/1550f5c94eb9dd62c5746ff09130239c1e5cdc16))
* parallelize detail enrichment API calls ([1550f5c](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/commit/1550f5c94eb9dd62c5746ff09130239c1e5cdc16))
* parallelize detail enrichment API calls ([ed2aeb8](https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock/commit/ed2aeb8dba2b1582d13bfb3c11b9d464a0b376e8))



































