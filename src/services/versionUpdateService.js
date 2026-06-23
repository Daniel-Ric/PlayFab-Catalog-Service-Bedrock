// -----------------------------------------------------------------------------
//
// File: src/services/versionUpdateService.js
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

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const DEFAULT_REPOSITORY = "Daniel-Ric/PlayFab-Catalog-Service-Bedrock";
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;
const USER_AGENT = "PlayFab-Catalog-Service-Bedrock";

class GitHubApiError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = "GitHubApiError";
        this.status = options.status;
        this.statusText = options.statusText;
        this.url = options.url;
        this.body = options.body;
    }
}

function readIntEnv(env, key, def) {
    const raw = env && env[key];
    if (!raw) return def;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : def;
}

function readBoolEnv(env, key, def = false) {
    const raw = env && env[key];
    if (typeof raw === "undefined" || raw === null || raw === "") return def;
    return /^(1|true|yes|on)$/i.test(String(raw));
}

function firstEnv(env, keys) {
    for (const key of keys) {
        const value = env && env[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
}

function normalizeRepository(value) {
    let raw = String(value || "").trim();
    if (!raw) return null;

    raw = raw.replace(/^git\+/, "");
    const direct = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (direct) return `${direct[1]}/${direct[2].replace(/\.git$/i, "")}`;

    const github = raw.match(/github\.com[:/]+([^/\s]+)\/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$/i);
    if (!github) return null;
    return `${github[1]}/${github[2].replace(/\.git$/i, "")}`;
}

function splitRepository(repository) {
    const normalized = normalizeRepository(repository);
    if (!normalized) return null;
    const [owner, name] = normalized.split("/");
    return {
        owner,
        name,
        fullName: normalized,
        htmlUrl: `https://github.com/${owner}/${name}`,
        apiUrl: `https://api.github.com/repos/${owner}/${name}`,
        releasesUrl: `https://github.com/${owner}/${name}/releases`,
        tagsUrl: `https://github.com/${owner}/${name}/tags`
    };
}

function safeRead(filePath) {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch {
        return null;
    }
}

function resolveGitDir(root) {
    const dotGit = path.join(root, ".git");
    const stat = fs.existsSync(dotGit) ? fs.statSync(dotGit) : null;
    if (!stat) return null;
    if (stat.isDirectory()) return dotGit;
    if (!stat.isFile()) return null;

    const text = safeRead(dotGit);
    const match = text && text.match(/^gitdir:\s*(.+)$/im);
    if (!match) return null;
    const gitDir = match[1].trim();
    return path.isAbsolute(gitDir) ? gitDir : path.resolve(root, gitDir);
}

function readOriginRemote(root = PROJECT_ROOT) {
    const gitDir = resolveGitDir(root);
    const configText = gitDir ? safeRead(path.join(gitDir, "config")) : null;
    if (!configText) return null;

    let activeRemote = null;
    for (const line of configText.split(/\r?\n/)) {
        const remote = line.match(/^\s*\[remote\s+"([^"]+)"\]\s*$/);
        if (remote) {
            activeRemote = remote[1];
            continue;
        }

        const url = line.match(/^\s*url\s*=\s*(.+?)\s*$/);
        if (url && activeRemote === "origin") return url[1];
    }

    return null;
}

function readPackedRef(gitDir, refName) {
    const packedRefs = safeRead(path.join(gitDir, "packed-refs"));
    if (!packedRefs) return null;
    for (const line of packedRefs.split(/\r?\n/)) {
        if (!line || line.startsWith("#") || line.startsWith("^")) continue;
        const [commit, ref] = line.trim().split(/\s+/);
        if (ref === refName && /^[0-9a-f]{7,40}$/i.test(commit)) return commit;
    }
    return null;
}

function readRefs(dir, prefix = "") {
    const refs = [];
    if (!dir || !fs.existsSync(dir)) return refs;
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            refs.push(...readRefs(full, name));
            continue;
        }
        if (!entry.isFile()) continue;
        const sha = safeRead(full);
        if (sha && /^[0-9a-f]{7,40}$/i.test(sha.trim())) {
            refs.push({name, sha: sha.trim()});
        }
    }
    return refs;
}

function readPackedRefs(gitDir) {
    const packedRefs = safeRead(path.join(gitDir, "packed-refs"));
    if (!packedRefs) return [];
    const refs = [];
    for (const line of packedRefs.split(/\r?\n/)) {
        if (!line || line.startsWith("#") || line.startsWith("^")) continue;
        const [sha, ref] = line.trim().split(/\s+/);
        if (!ref || !/^[0-9a-f]{7,40}$/i.test(sha)) continue;
        refs.push({ref, sha});
    }
    return refs;
}

function readTagsForCommit(gitDir, commit) {
    if (!gitDir || !commit) return [];
    const wanted = commit.toLowerCase();
    const tags = [];

    for (const ref of readRefs(path.join(gitDir, "refs", "tags"))) {
        if (ref.sha.toLowerCase() === wanted) tags.push(ref.name);
    }

    for (const ref of readPackedRefs(gitDir)) {
        if (!ref.ref.startsWith("refs/tags/")) continue;
        if (ref.sha.toLowerCase() === wanted) tags.push(ref.ref.slice("refs/tags/".length));
    }

    return Array.from(new Set(tags)).sort();
}

function readGitInfo(root = PROJECT_ROOT, env = process.env) {
    const gitDir = resolveGitDir(root);
    const envCommit = firstEnv(env, [
        "GITHUB_SHA",
        "COMMIT_SHA",
        "SOURCE_VERSION",
        "VERCEL_GIT_COMMIT_SHA",
        "RAILWAY_GIT_COMMIT_SHA",
        "RENDER_GIT_COMMIT"
    ]);
    const envBranch = firstEnv(env, [
        "GITHUB_REF_NAME",
        "BRANCH_NAME",
        "VERCEL_GIT_COMMIT_REF",
        "RAILWAY_GIT_BRANCH",
        "RENDER_GIT_BRANCH"
    ]);

    let commit = envCommit || null;
    let branch = envBranch || null;
    let ref = null;
    let tag = null;

    const headText = gitDir ? safeRead(path.join(gitDir, "HEAD")) : null;
    const head = headText ? headText.trim() : null;
    if (head && head.startsWith("ref:")) {
        ref = head.slice(4).trim();
        if (!branch && ref.startsWith("refs/heads/")) branch = ref.slice("refs/heads/".length);
        if (ref.startsWith("refs/tags/")) tag = ref.slice("refs/tags/".length);

        if (!commit && gitDir) {
            const refPath = path.join(gitDir, ...ref.split("/"));
            const refCommit = safeRead(refPath);
            commit = refCommit ? refCommit.trim() : readPackedRef(gitDir, ref);
        }
    } else if (!commit && head && /^[0-9a-f]{7,40}$/i.test(head)) {
        commit = head;
    }

    if (!tag && env.GITHUB_REF && String(env.GITHUB_REF).startsWith("refs/tags/")) {
        tag = String(env.GITHUB_REF).slice("refs/tags/".length);
    }
    if (!tag && env.GITHUB_REF_TYPE === "tag" && env.GITHUB_REF_NAME) {
        tag = env.GITHUB_REF_NAME;
    }

    if (commit && !/^[0-9a-f]{7,40}$/i.test(commit)) commit = null;
    const tags = commit ? readTagsForCommit(gitDir, commit) : [];
    if (tag && !tags.includes(tag)) tags.unshift(tag);
    if (tag && branch === tag) branch = null;

    const runUrl = env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
        : null;

    return {
        branch,
        ref,
        tag,
        tags,
        commit,
        shortCommit: commit ? commit.slice(0, 12) : null,
        runUrl
    };
}

function readPackageInfo(root = PROJECT_ROOT) {
    const text = safeRead(path.join(root, "package.json"));
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

function repositoryFromPackage(pkg) {
    if (!pkg || !pkg.repository) return null;
    if (typeof pkg.repository === "string") return pkg.repository;
    return pkg.repository.url || null;
}

function resolveRepository({root = PROJECT_ROOT, env = process.env, packageInfo = null} = {}) {
    const pkg = packageInfo || readPackageInfo(root);
    const fromEnv = firstEnv(env, [
        "UPDATE_CHECK_REPOSITORY",
        "GITHUB_REPOSITORY",
        "GITHUB_REPO",
        "GH_REPOSITORY"
    ]);
    return splitRepository(
        normalizeRepository(fromEnv)
        || normalizeRepository(repositoryFromPackage(pkg))
        || normalizeRepository(readOriginRemote(root))
        || DEFAULT_REPOSITORY
    );
}

function normalizeVersionTag(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    const match = raw.match(/(?:^|[^0-9])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/)
        || raw.match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/);
    return match ? match[1] : null;
}

function parseVersion(input) {
    const normalized = normalizeVersionTag(input);
    if (!normalized) return null;
    const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/);
    if (!match) return null;
    return {
        raw: String(input),
        normalized,
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ? match[4].split(".") : [],
        build: match[5] || null
    };
}

function compareIdentifiers(a, b) {
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && bNum) return Number(a) - Number(b);
    if (aNum) return -1;
    if (bNum) return 1;
    return a.localeCompare(b);
}

function comparePrerelease(a, b) {
    if (!a.length && !b.length) return 0;
    if (!a.length) return 1;
    if (!b.length) return -1;

    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i += 1) {
        if (typeof a[i] === "undefined") return -1;
        if (typeof b[i] === "undefined") return 1;
        const cmp = compareIdentifiers(a[i], b[i]);
        if (cmp !== 0) return cmp;
    }
    return 0;
}

function compareVersions(current, latest) {
    const a = parseVersion(current);
    const b = parseVersion(latest);
    if (!a || !b) return null;

    for (const key of ["major", "minor", "patch"]) {
        if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
    }

    const pre = comparePrerelease(a.prerelease, b.prerelease);
    return pre === 0 ? 0 : pre > 0 ? 1 : -1;
}

function pickHighestVersion(values) {
    let best = null;
    for (const value of values) {
        const parsed = parseVersion(value);
        if (!parsed) continue;
        if (!best || compareVersions(parsed.normalized, best.normalized) > 0) {
            best = parsed;
        }
    }
    return best;
}

function buildUpdateState(currentVersion, latestVersion) {
    const compare = compareVersions(currentVersion, latestVersion);
    if (compare === null) {
        return {
            available: null,
            status: "unknown",
            current: currentVersion || null,
            latest: latestVersion || null,
            compare: null,
            reason: "unparseable_version"
        };
    }

    if (compare < 0) {
        return {
            available: true,
            status: "outdated",
            current: currentVersion,
            latest: latestVersion,
            compare,
            reason: null
        };
    }

    if (compare > 0) {
        return {
            available: false,
            status: "ahead",
            current: currentVersion,
            latest: latestVersion,
            compare,
            reason: "local_version_is_newer"
        };
    }

    return {
        available: false,
        status: "current",
        current: currentVersion,
        latest: latestVersion,
        compare,
        reason: null
    };
}

function buildCommitMatchedUpdateState(local, remote) {
    const latest = remote && remote.latest;
    const latestSha = latest && latest.commit && latest.commit.sha;
    const localSha = local && local.git && local.git.commit;
    if (!latestSha || !localSha) return null;
    if (latestSha.toLowerCase() !== localSha.toLowerCase()) return null;

    return {
        available: false,
        status: "current",
        current: latest.version || local.version || null,
        latest: latest.version || null,
        compare: 0,
        reason: "local_commit_matches_latest_remote_ref"
    };
}

function getDefaultFetch() {
    if (typeof fetch === "function") return fetch;
    return require("undici").fetch;
}

function getHeader(headers, key) {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(key);
    return headers[key] || headers[key.toLowerCase()] || null;
}

function readRateLimit(headers) {
    const reset = getHeader(headers, "x-ratelimit-reset");
    return {
        limit: getHeader(headers, "x-ratelimit-limit"),
        remaining: getHeader(headers, "x-ratelimit-remaining"),
        used: getHeader(headers, "x-ratelimit-used"),
        resource: getHeader(headers, "x-ratelimit-resource"),
        resetAt: reset ? Number(reset) * 1000 : null
    };
}

async function readResponseBody(response) {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function fetchGitHubJson({url, fetchImpl, etag, timeoutMs}) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

    try {
        const headers = {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": USER_AGENT
        };
        if (etag) headers["If-None-Match"] = etag;

        const response = await fetchImpl(url, {
            method: "GET",
            headers,
            signal: controller ? controller.signal : undefined
        });
        const rateLimit = readRateLimit(response.headers);
        const responseEtag = getHeader(response.headers, "etag") || etag || null;

        if (response.status === 304) {
            return {
                notModified: true,
                etag: responseEtag,
                rateLimit
            };
        }

        const body = await readResponseBody(response);
        if (!response.ok) {
            throw new GitHubApiError(`GitHub API returned ${response.status}`, {
                status: response.status,
                statusText: response.statusText,
                url,
                body
            });
        }

        return {
            notModified: false,
            body,
            etag: responseEtag,
            rateLimit
        };
    } catch (err) {
        if (err && err.name === "AbortError") {
            throw new GitHubApiError("GitHub update check timed out", {url});
        }
        throw err;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function shortSha(sha) {
    return sha ? String(sha).slice(0, 12) : null;
}

async function resolveGitHubTagCommit({repository, tagName, fetchImpl, timeoutMs}) {
    if (!repository || !tagName) return null;
    const encodedTag = String(tagName).split("/").map(part => encodeURIComponent(part)).join("/");
    const refUrl = `${repository.apiUrl}/git/ref/tags/${encodedTag}`;
    const refResult = await fetchGitHubJson({url: refUrl, fetchImpl, etag: null, timeoutMs});
    const object = refResult.body && refResult.body.object;
    if (!object || !object.sha) return null;

    if (object.type === "commit") {
        return {
            sha: object.sha,
            shortSha: shortSha(object.sha),
            type: "commit",
            url: object.url || null
        };
    }

    if (object.type === "tag" && object.url) {
        const tagResult = await fetchGitHubJson({url: object.url, fetchImpl, etag: null, timeoutMs});
        const target = tagResult.body && tagResult.body.object;
        if (target && target.sha) {
            return {
                sha: target.sha,
                shortSha: shortSha(target.sha),
                type: target.type || "commit",
                url: target.url || null,
                tagObjectSha: object.sha
            };
        }
    }

    return {
        sha: object.sha,
        shortSha: shortSha(object.sha),
        type: object.type || "unknown",
        url: object.url || null
    };
}

function mapRelease(release, repository, rateLimit, etag, commit = null) {
    const tagName = release && release.tag_name;
    const version = normalizeVersionTag(tagName);
    return {
        ok: true,
        status: "ok",
        source: "release",
        repository,
        latest: {
            version,
            tagName,
            name: release.name || tagName || null,
            prerelease: !!release.prerelease,
            draft: !!release.draft,
            publishedAt: release.published_at || null,
            createdAt: release.created_at || null,
            url: release.html_url || null,
            apiUrl: release.url || null,
            targetCommitish: release.target_commitish || null,
            commit
        },
        etag,
        rateLimit
    };
}

function mapTag(tag, repository, rateLimit, etag) {
    const tagName = tag && tag.name;
    const version = normalizeVersionTag(tagName);
    return {
        ok: true,
        status: "ok",
        source: "tag",
        repository,
        latest: {
            version,
            tagName,
            name: tagName || null,
            prerelease: false,
            draft: false,
            publishedAt: null,
            createdAt: null,
            url: repository ? `${repository.htmlUrl}/releases/tag/${encodeURIComponent(tagName || "")}` : null,
            apiUrl: tag && tag.commit ? tag.commit.url : null,
            commit: tag && tag.commit && tag.commit.sha ? {
                sha: tag.commit.sha,
                shortSha: shortSha(tag.commit.sha),
                type: "commit",
                url: tag.commit.url || null
            } : null
        },
        etag,
        rateLimit
    };
}

function selectRelease(releases, includePrerelease) {
    if (!Array.isArray(releases)) return null;
    return releases.find(release => {
        if (!release || release.draft) return false;
        return includePrerelease ? true : !release.prerelease;
    }) || null;
}

async function fetchLatestRelease({repository, includePrerelease, fetchImpl, etag, timeoutMs}) {
    const url = includePrerelease
        ? `${repository.apiUrl}/releases?per_page=20`
        : `${repository.apiUrl}/releases/latest`;
    const result = await fetchGitHubJson({url, fetchImpl, etag, timeoutMs});
    if (result.notModified) return result;

    const release = includePrerelease ? selectRelease(result.body, includePrerelease) : result.body;
    if (!release || !release.tag_name) {
        throw new GitHubApiError("No GitHub release was found", {
            status: 404,
            url,
            body: result.body
        });
    }

    let commit = null;
    try {
        commit = await resolveGitHubTagCommit({repository, tagName: release.tag_name, fetchImpl, timeoutMs});
    } catch {
        commit = null;
    }

    return {
        ...result,
        remote: mapRelease(release, repository, result.rateLimit, result.etag, commit)
    };
}

async function fetchLatestTag({repository, fetchImpl, etag, timeoutMs}) {
    const url = `${repository.apiUrl}/tags?per_page=1`;
    const result = await fetchGitHubJson({url, fetchImpl, etag, timeoutMs});
    if (result.notModified) return result;

    const tag = Array.isArray(result.body) ? result.body[0] : null;
    if (!tag || !tag.name) {
        throw new GitHubApiError("No GitHub tag was found", {
            status: 404,
            url,
            body: result.body
        });
    }

    return {
        ...result,
        remote: mapTag(tag, repository, result.rateLimit, result.etag)
    };
}

async function fetchRemoteVersion({repository, source, includePrerelease, fetchImpl, etag, timeoutMs}) {
    if (source === "tag") {
        return fetchLatestTag({repository, fetchImpl, etag, timeoutMs});
    }

    try {
        return await fetchLatestRelease({repository, includePrerelease, fetchImpl, etag, timeoutMs});
    } catch (err) {
        if (source !== "auto" || err.status !== 404) throw err;
        return fetchLatestTag({repository, fetchImpl, etag: null, timeoutMs});
    }
}

function getCacheInfo({hit, stale, ttlMs, checkedAt, expiresAt}) {
    return {
        hit: !!hit,
        stale: !!stale,
        ttlMs,
        checkedAt,
        expiresAt
    };
}

function createErrorRemote({repository, source, includePrerelease, err, checkedAt, cacheInfo}) {
    return {
        ok: false,
        status: "error",
        source,
        includePrerelease,
        repository,
        checkedAt,
        latest: null,
        cache: cacheInfo,
        error: {
            message: err && err.message ? err.message : "GitHub update check failed",
            status: err && err.status ? err.status : null,
            url: err && err.url ? err.url : null
        }
    };
}

function createVersionUpdateService(options = {}) {
    const root = options.root || PROJECT_ROOT;
    const env = options.env || process.env;
    const fetchImpl = options.fetchImpl || getDefaultFetch();
    const readPackageInfoFn = options.readPackageInfo || (() => readPackageInfo(root));
    const cache = new Map();

    function getLocalVersionInfo() {
        const packageInfo = readPackageInfoFn() || {};
        const repository = resolveRepository({root, env, packageInfo});
        const packageVersion = String(packageInfo.version || "0.0.0");
        const git = readGitInfo(root, env);
        const tagVersion = pickHighestVersion([git.tag, ...(git.tags || [])]);
        const version = tagVersion ? tagVersion.normalized : packageVersion;

        return {
            name: packageInfo.name || null,
            version,
            versionSource: tagVersion ? "git_tag" : "package",
            packageVersion,
            normalizedVersion: normalizeVersionTag(version),
            repository,
            git
        };
    }

    async function getRemote(repository, optionsForRequest = {}) {
        const now = Date.now();
        const source = optionsForRequest.source || "auto";
        const includePrerelease = !!optionsForRequest.includePrerelease;
        const refresh = !!optionsForRequest.refresh;
        const ttlMs = readIntEnv(env, "UPDATE_CHECK_TTL_MS", DEFAULT_TTL_MS);
        const timeoutMs = readIntEnv(env, "UPDATE_CHECK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
        const enabled = readBoolEnv(env, "UPDATE_CHECK_ENABLED", true);

        if (!enabled) {
            return {
                ok: false,
                status: "disabled",
                source,
                includePrerelease,
                repository,
                checkedAt: null,
                latest: null,
                cache: getCacheInfo({hit: false, stale: false, ttlMs, checkedAt: null, expiresAt: null})
            };
        }

        const key = `${repository.fullName}:${source}:${includePrerelease}`;
        const cached = cache.get(key);
        if (cached && !refresh && cached.expiresAt > now) {
            return {
                ...cached.remote,
                cache: getCacheInfo({
                    hit: true,
                    stale: false,
                    ttlMs,
                    checkedAt: cached.checkedAt,
                    expiresAt: cached.expiresAt
                })
            };
        }

        try {
            const result = await fetchRemoteVersion({
                repository,
                source,
                includePrerelease,
                fetchImpl,
                etag: cached ? cached.etag : null,
                timeoutMs
            });

            let remote;
            if (result.notModified && cached) {
                remote = {
                    ...cached.remote,
                    status: "not_modified",
                    rateLimit: result.rateLimit || cached.remote.rateLimit
                };
            } else {
                remote = result.remote;
            }

            remote.checkedAt = now;
            remote.includePrerelease = includePrerelease;

            const expiresAt = now + ttlMs;
            cache.set(key, {
                remote,
                etag: result.etag || (cached && cached.etag) || null,
                checkedAt: now,
                expiresAt
            });

            return {
                ...remote,
                cache: getCacheInfo({
                    hit: false,
                    stale: false,
                    ttlMs,
                    checkedAt: now,
                    expiresAt
                })
            };
        } catch (err) {
            if (cached) {
                return {
                    ...cached.remote,
                    status: "stale",
                    checkedAt: cached.checkedAt,
                    includePrerelease,
                    cache: getCacheInfo({
                        hit: false,
                        stale: true,
                        ttlMs,
                        checkedAt: cached.checkedAt,
                        expiresAt: cached.expiresAt
                    }),
                    error: {
                        message: err && err.message ? err.message : "GitHub update check failed",
                        status: err && err.status ? err.status : null,
                        url: err && err.url ? err.url : null
                    }
                };
            }

            return createErrorRemote({
                repository,
                source,
                includePrerelease,
                err,
                checkedAt: now,
                cacheInfo: getCacheInfo({hit: false, stale: false, ttlMs, checkedAt: now, expiresAt: null})
            });
        }
    }

    async function getVersionStatus(optionsForRequest = {}) {
        const local = getLocalVersionInfo();
        const remote = await getRemote(local.repository, optionsForRequest);
        const update = remote.latest && remote.latest.version
            ? buildCommitMatchedUpdateState(local, remote) || buildUpdateState(local.version, remote.latest.version)
            : {
                available: null,
                status: remote.status === "disabled" ? "disabled" : "unknown",
                current: local.version,
                latest: null,
                compare: null,
                reason: remote.status === "disabled" ? "remote_check_disabled" : "remote_unavailable"
            };

        return {
            versionCheckerVersion: "v1",
            ok: true,
            timestamp: Date.now(),
            local,
            repository: local.repository,
            remote,
            update
        };
    }

    return {
        getVersionStatus,
        clearCache: () => cache.clear(),
        getLocalVersionInfo
    };
}

const versionUpdateService = createVersionUpdateService();

module.exports = {
    GitHubApiError,
    normalizeRepository,
    splitRepository,
    normalizeVersionTag,
    parseVersion,
    compareVersions,
    buildUpdateState,
    readGitInfo,
    readOriginRemote,
    resolveRepository,
    createVersionUpdateService,
    versionUpdateService
};
