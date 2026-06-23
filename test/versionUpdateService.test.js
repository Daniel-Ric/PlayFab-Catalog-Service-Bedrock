// -----------------------------------------------------------------------------
//
// File: test/versionUpdateService.test.js
// Disclaimer: "PlayFab Catalog Service Bedrock" by SpindexGFX is an independent project.
// It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Mojang AB,
// Microsoft Corporation, or any of their subsidiaries or affiliates.
// No partnership, approval, or official relationship with Mojang AB or Microsoft is implied.
//
// All names, logos, brands, trademarks, service marks, and registered trademarks are the
// property of their respective owners and are used strictly for identification/reference only.
// This project does not claim ownership of third-party IP and provides no license to use it.
//
// -----------------------------------------------------------------------------

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    normalizeRepository,
    compareVersions,
    buildUpdateState,
    createVersionUpdateService
} = require("../src/services/versionUpdateService");

function mockResponse(status, body, headers = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        statusText: status === 304 ? "Not Modified" : "OK",
        headers: {
            get: key => headers[key.toLowerCase()] || null
        },
        text: async () => body == null ? "" : JSON.stringify(body)
    };
}

test("normalizeRepository accepts GitHub URL formats", () => {
    assert.equal(normalizeRepository("Daniel-Ric/PlayFab-Catalog-Service-Bedrock"), "Daniel-Ric/PlayFab-Catalog-Service-Bedrock");
    assert.equal(normalizeRepository("https://github.com/Daniel-Ric/PlayFab-Catalog-Service-Bedrock.git"), "Daniel-Ric/PlayFab-Catalog-Service-Bedrock");
    assert.equal(normalizeRepository("git@github.com:Daniel-Ric/PlayFab-Catalog-Service-Bedrock.git"), "Daniel-Ric/PlayFab-Catalog-Service-Bedrock");
});

test("compareVersions compares stable and prerelease semver tags", () => {
    assert.equal(compareVersions("1.0.0", "v1.0.1"), -1);
    assert.equal(compareVersions("1.2.0", "1.1.9"), 1);
    assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
    assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
});

test("buildUpdateState reports outdated versions", () => {
    assert.deepEqual(buildUpdateState("1.0.0", "1.2.0"), {
        available: true,
        status: "outdated",
        current: "1.0.0",
        latest: "1.2.0",
        compare: -1,
        reason: null
    });
});

test("version service checks GitHub releases and reuses ETag cache", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({url, headers: options.headers});
        if (url.endsWith("/releases/latest")) {
            if (options.headers["If-None-Match"]) {
                return mockResponse(304, null, {
                    etag: "\"release-etag\"",
                    "x-ratelimit-remaining": "58"
                });
            }
            return mockResponse(200, {
                tag_name: "v1.2.0",
                name: "v1.2.0",
                prerelease: false,
                draft: false,
                published_at: "2026-06-20T10:00:00Z",
                html_url: "https://github.com/example/project/releases/tag/v1.2.0",
                url: "https://api.github.com/repos/example/project/releases/1"
            }, {
                etag: "\"release-etag\"",
                "x-ratelimit-remaining": "59"
            });
        }
        if (url.endsWith("/git/ref/tags/v1.2.0")) {
            return mockResponse(200, {
                object: {
                    type: "commit",
                    sha: "1111111111111111111111111111111111111111",
                    url: "https://api.github.com/repos/example/project/git/commits/1111111111111111111111111111111111111111"
                }
            });
        }
        throw new Error(`Unexpected URL ${url}`);
    };

    const service = createVersionUpdateService({
        env: {
            UPDATE_CHECK_REPOSITORY: "example/project",
            UPDATE_CHECK_TTL_MS: "60000"
        },
        fetchImpl,
        readPackageInfo: () => ({name: "project", version: "1.0.0"})
    });

    const first = await service.getVersionStatus();
    assert.equal(first.remote.source, "release");
    assert.equal(first.remote.latest.version, "1.2.0");
    assert.equal(first.update.available, true);

    const cached = await service.getVersionStatus();
    assert.equal(cached.remote.cache.hit, true);
    assert.equal(calls.length, 2);

    const refreshed = await service.getVersionStatus({refresh: true});
    assert.equal(refreshed.remote.status, "not_modified");
    assert.equal(calls.length, 3);
    assert.equal(calls[2].headers["If-None-Match"], "\"release-etag\"");
});

test("version service prefers local semver git tags over package version", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "version-check-"));
    const gitDir = path.join(root, ".git");
    const commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    fs.mkdirSync(path.join(gitDir, "refs", "heads"), {recursive: true});
    fs.mkdirSync(path.join(gitDir, "refs", "tags"), {recursive: true});
    fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n", "utf8");
    fs.writeFileSync(path.join(gitDir, "refs", "heads", "main"), `${commit}\n`, "utf8");
    fs.writeFileSync(path.join(gitDir, "refs", "tags", "v2.0.0"), `${commit}\n`, "utf8");
    fs.writeFileSync(path.join(gitDir, "refs", "tags", "v1.5.0"), `${commit}\n`, "utf8");

    const service = createVersionUpdateService({
        root,
        env: {UPDATE_CHECK_REPOSITORY: "example/project"},
        fetchImpl: async () => mockResponse(200, {tag_name: "v2.0.0"}),
        readPackageInfo: () => ({name: "project", version: "1.0.0"})
    });

    const local = service.getLocalVersionInfo();
    assert.equal(local.version, "2.0.0");
    assert.equal(local.versionSource, "git_tag");
    assert.equal(local.packageVersion, "1.0.0");
    assert.deepEqual(local.git.tags, ["v1.5.0", "v2.0.0"]);
});

test("version service treats matching latest release commit as current", async () => {
    const commit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        if (url.endsWith("/releases/latest")) {
            return mockResponse(200, {
                tag_name: "v1.2.0",
                name: "v1.2.0",
                prerelease: false,
                draft: false,
                published_at: "2026-06-20T10:00:00Z",
                html_url: "https://github.com/example/project/releases/tag/v1.2.0",
                url: "https://api.github.com/repos/example/project/releases/1"
            });
        }
        if (url.endsWith("/git/ref/tags/v1.2.0")) {
            return mockResponse(200, {
                object: {
                    type: "commit",
                    sha: commit,
                    url: `https://api.github.com/repos/example/project/git/commits/${commit}`
                }
            });
        }
        throw new Error(`Unexpected URL ${url}`);
    };

    const service = createVersionUpdateService({
        env: {
            UPDATE_CHECK_REPOSITORY: "example/project",
            COMMIT_SHA: commit
        },
        fetchImpl,
        readPackageInfo: () => ({name: "project", version: "1.0.0"})
    });

    const status = await service.getVersionStatus();
    assert.equal(status.update.status, "current");
    assert.equal(status.update.current, "1.2.0");
    assert.equal(status.update.reason, "local_commit_matches_latest_remote_ref");
    assert.equal(status.remote.latest.commit.shortSha, commit.slice(0, 12));
    assert.equal(calls.length, 2);
});

test("version service does not send authorization for public checks", async () => {
    let authorizationHeader;
    const fetchImpl = async (_url, options) => {
        authorizationHeader = options.headers.Authorization;
        return mockResponse(200, {
            tag_name: "v1.0.0",
            name: "v1.0.0",
            prerelease: false,
            draft: false,
            published_at: "2026-06-20T10:00:00Z",
            html_url: "https://github.com/example/project/releases/tag/v1.0.0",
            url: "https://api.github.com/repos/example/project/releases/1"
        });
    };

    const service = createVersionUpdateService({
        env: {
            UPDATE_CHECK_REPOSITORY: "example/project"
        },
        fetchImpl,
        readPackageInfo: () => ({name: "project", version: "1.0.0"})
    });

    await service.getVersionStatus();
    assert.equal(authorizationHeader, undefined);
});
