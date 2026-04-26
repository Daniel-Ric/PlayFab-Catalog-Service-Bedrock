"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");
const path = require("path");

const CHANGELOG_PATH = path.resolve(process.cwd(), "CHANGELOG.md");

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function tryGit(args) {
  try {
    return runGit(args);
  } catch {
    return "";
  }
}

function parseVersion(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatVersion(version) {
  return `v${version.major}.${version.minor}.${version.patch}`;
}

function bumpVersion(version, bump) {
  if (bump === "major") {
    return { major: version.major + 1, minor: 0, patch: 0 };
  }

  if (bump === "minor") {
    return { major: version.major, minor: version.minor + 1, patch: 0 };
  }

  return { major: version.major, minor: version.minor, patch: version.patch + 1 };
}

function compareVersions(a, b) {
  if (a.major !== b.major) {
    return a.major - b.major;
  }

  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }

  return a.patch - b.patch;
}

function getLatestVersionTag() {
  const tags = tryGit(["tag", "--list", "v*.*.*"]).split(/\r?\n/).filter(Boolean);
  const parsed = tags
    .map((tag) => ({ tag, version: parseVersion(tag) }))
    .filter((entry) => entry.version)
    .sort((left, right) => compareVersions(left.version, right.version));

  if (parsed.length === 0) {
    return { tag: "v0.0.0", version: { major: 0, minor: 0, patch: 0 } };
  }

  return parsed[parsed.length - 1];
}

function getCommitsToRelease(before, after) {
  if (!after || /^0+$/.test(after)) {
    return [];
  }

  const range =
    before && !/^0+$/.test(before) ? `${before}..${after}` : after;
  const commits = tryGit(["rev-list", "--reverse", range]).split(/\r?\n/).filter(Boolean);
  const relevantCommits =
    before && !/^0+$/.test(before) ? commits : [after];

  return relevantCommits.filter(
    (sha) => !tryGit(["tag", "--points-at", sha]).split(/\r?\n/).filter(Boolean).length,
  );
}

function parseNumStat(sha) {
  const output = tryGit(["show", "--format=", "--numstat", "--find-renames", sha]);
  const files = [];
  let additions = 0;
  let deletions = 0;

  for (const line of output.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    const [addedRaw, deletedRaw, ...rest] = line.split("\t");
    const filePath = rest.join("\t");
    const added = addedRaw === "-" ? 0 : Number(addedRaw);
    const deleted = deletedRaw === "-" ? 0 : Number(deletedRaw);

    additions += Number.isFinite(added) ? added : 0;
    deletions += Number.isFinite(deleted) ? deleted : 0;
    files.push(filePath);
  }

  return {
    files,
    filesChanged: files.length,
    additions,
    deletions,
    totalChanges: additions + deletions,
  };
}

function cleanCommitSubject(subject) {
  return subject
    .replace(/^Merge pull request\s+#\d+\s+from\s+\S+\s*/i, "Merge ")
    .replace(/^[a-z]+(\(.+\))?!?:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function determineBump(commitMessage, stats) {
  if (/BREAKING CHANGE|!:/.test(commitMessage) || stats.filesChanged >= 20 || stats.totalChanges >= 700) {
    return "major";
  }

  if (/^feat(\(.+\))?:/im.test(commitMessage) || stats.filesChanged >= 6 || stats.totalChanges >= 180) {
    return "minor";
  }

  return "patch";
}

function summarizeAreas(files) {
  const interesting = new Set();

  for (const file of files) {
    const normalized = file.replace(/\\/g, "/");
    if (normalized.startsWith(".github/")) {
      interesting.add("CI and workflow automation");
      continue;
    }

    if (normalized.startsWith("src/")) {
      interesting.add("application logic");
      continue;
    }

    if (normalized.startsWith("test/")) {
      interesting.add("test coverage");
      continue;
    }

    if (/^package(-lock)?\.json$/i.test(normalized)) {
      interesting.add("project dependencies");
      continue;
    }

    interesting.add("repository files");
  }

  return Array.from(interesting).slice(0, 3);
}

function buildReleaseBody({ sha, subject, stats, bump }) {
  const shortSha = sha.slice(0, 7);
  const areas = summarizeAreas(stats.files);
  const scopeLine = areas.length
    ? `This release mainly updates ${areas.join(", ")}.`
    : "This release updates the repository state.";

  return [
    `Automated release for commit \`${shortSha}\`.`,
    "",
    "## Summary",
    scopeLine,
    `- Commit: ${subject || "Repository update"}`,
    `- Version bump: ${bump}`,
    `- Files changed: ${stats.filesChanged}`,
    `- Line changes: +${stats.additions} / -${stats.deletions}`,
  ].join("\n");
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildChangelogEntry({ tagName, sha, subject, stats, bump }) {
  const versionLabel = tagName.replace(/^v/, "");
  const shortSha = sha.slice(0, 7);
  const areas = summarizeAreas(stats.files);
  const scopeLine = areas.length
    ? `This release mainly updates ${areas.join(", ")}.`
    : "This release updates the repository state.";

  return [
    `## ${versionLabel} (${getTodayIsoDate()})`,
    "",
    "### Summary",
    "",
    `- ${subject || "Repository update"} (${shortSha})`,
    `- Version bump: ${bump}`,
    `- Files changed: ${stats.filesChanged}`,
    `- Line changes: +${stats.additions} / -${stats.deletions}`,
    `- Scope: ${scopeLine}`,
    "",
  ].join("\n");
}

function updateChangelog(entries) {
  if (!entries.length) {
    return false;
  }

  const existing = fs.existsSync(CHANGELOG_PATH)
    ? fs.readFileSync(CHANGELOG_PATH, "utf8")
    : "# Changelog\n\n";

  const normalizedExisting = existing.trimStart().startsWith("# Changelog")
    ? existing
    : `# Changelog\n\n${existing}`;

  const withoutHeader = normalizedExisting.replace(/^# Changelog\s*/u, "").replace(/^\s+/, "");
  const nextContent = `# Changelog\n\n${entries.join("\n")}${withoutHeader ? `${withoutHeader.trimStart()}\n` : ""}`;

  if (nextContent === existing) {
    return false;
  }

  fs.writeFileSync(CHANGELOG_PATH, nextContent, "utf8");
  return true;
}

function commitAndPushChangelog(branchName) {
  if (!branchName) {
    console.log("No branch name provided. Skipping changelog commit.");
    return;
  }

  runGit(["config", "user.name", "github-actions[bot]"]);
  runGit(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  runGit(["add", "CHANGELOG.md"]);

  const staged = tryGit(["diff", "--cached", "--name-only"]);
  if (!staged) {
    console.log("No changelog changes staged.");
    return;
  }

  runGit(["commit", "-m", "chore(release): update changelog [skip release]"]);
  try {
    runGit(["push", "origin", `HEAD:${branchName}`]);
  } catch (error) {
    const stderr = String(error.stderr || "");
    if (!stderr.includes("non-fast-forward")) {
      throw error;
    }

    console.log(`Remote ${branchName} advanced before changelog push. Rebasing and retrying.`);
    runGit(["fetch", "origin", branchName]);
    runGit(["rebase", `origin/${branchName}`], { stdio: "inherit" });
    runGit(["push", "origin", `HEAD:${branchName}`]);
  }
}

async function githubRequest(path, method, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "playfab-catalog-release-workflow",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 422) {
    const payload = await response.json().catch(() => ({}));
    return { ok: false, status: 422, payload };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${path} failed with ${response.status}: ${text}`);
  }

  const payload = await response.json().catch(() => ({}));
  return { ok: true, status: response.status, payload };
}

async function createRelease(repo, tagName, targetCommitish, body, subject) {
  const result = await githubRequest(`/repos/${repo}/releases`, "POST", {
    tag_name: tagName,
    target_commitish: targetCommitish,
    name: tagName,
    body,
    draft: false,
    prerelease: false,
    generate_release_notes: false,
  });

  if (!result.ok && result.status === 422) {
    console.log(`Release for ${tagName} already exists or could not be created. Skipping.`);
    return;
  }

  console.log(`Created ${tagName} for ${targetCommitish.slice(0, 7)}: ${subject}`);
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  const branchName = process.env.GITHUB_REF_NAME || "";

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is required.");
  }

  if (!eventPath || !fs.existsSync(eventPath)) {
    throw new Error("GITHUB_EVENT_PATH is missing or invalid.");
  }

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const before = event.before || "";
  const after = process.env.GITHUB_SHA || event.after || "";

  runGit(["fetch", "--tags", "--force"]);

  let { version: currentVersion } = getLatestVersionTag();
  const commits = getCommitsToRelease(before, after);
  const changelogEntries = [];

  if (commits.length === 0) {
    console.log("No new untagged commits found.");
    return;
  }

  for (const sha of commits) {
    const fullMessage = tryGit(["show", "-s", "--format=%B", sha]);
    const subject = cleanCommitSubject(tryGit(["show", "-s", "--format=%s", sha]));
    const stats = parseNumStat(sha);
    const bump = determineBump(fullMessage, stats);

    currentVersion = bumpVersion(currentVersion, bump);

    const tagName = formatVersion(currentVersion);
    const body = buildReleaseBody({ sha, subject, stats, bump });
    changelogEntries.push(buildChangelogEntry({ tagName, sha, subject, stats, bump }));

    await createRelease(repository, tagName, sha, body, subject);
  }

  const changelogUpdated = updateChangelog(changelogEntries);
  if (changelogUpdated) {
    commitAndPushChangelog(branchName);
  } else {
    console.log("CHANGELOG.md already up to date.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
