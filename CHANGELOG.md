# Changelog

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





















