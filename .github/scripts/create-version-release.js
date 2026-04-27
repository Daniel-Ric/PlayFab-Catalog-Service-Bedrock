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

function classifyFile(file) {
  const normalized = file.replace(/\\/g, "/");

  if (normalized.startsWith(".github/workflows/")) {
    return "GitHub workflows";
  }

  if (normalized.startsWith(".github/scripts/")) {
    return "GitHub automation scripts";
  }

  if (normalized.startsWith(".github/")) {
    return "GitHub configuration";
  }

  if (normalized.startsWith("src/controllers/")) {
    return "API controllers";
  }

  if (normalized.startsWith("src/routes/")) {
    return "API routes";
  }

  if (normalized.startsWith("src/services/")) {
    return "Service layer";
  }

  if (normalized.startsWith("src/docs/")) {
    return "OpenAPI documentation";
  }

  if (normalized.startsWith("src/config/")) {
    return "Runtime configuration";
  }

  if (normalized.startsWith("src/utils/")) {
    return "Shared utilities";
  }

  if (normalized.startsWith("src/")) {
    return "Application source";
  }

  if (normalized.startsWith("test/")) {
    return "Tests";
  }

  if (/^package(-lock)?\.json$/i.test(normalized)) {
    return "Dependencies";
  }

  if (/^readme\.md$/i.test(normalized)) {
    return "README";
  }

  if (/^CHANGELOG\.md$/i.test(normalized)) {
    return "Changelog";
  }

  if (/postman_collection\.json$/i.test(normalized)) {
    return "Postman collection";
  }

  return "Repository files";
}

function groupFiles(files) {
  const groups = new Map();

  for (const file of files) {
    const normalized = file.replace(/\\/g, "/");
    const group = classifyFile(normalized);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push(normalized);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, groupedFiles]) => [label, groupedFiles.sort()]);
}

function formatGroupedFiles(files, maxPerGroup = 6, maxGroups = 8) {
  const groups = groupFiles(files);
  if (!groups.length) {
    return ["- No file-level changes were reported by git."];
  }

  const lines = [];
  for (const [label, groupedFiles] of groups.slice(0, maxGroups)) {
    const shown = groupedFiles.slice(0, maxPerGroup);
    lines.push(`- ${label}: ${shown.join(", ")}${groupedFiles.length > shown.length ? `, and ${groupedFiles.length - shown.length} more` : ""}`);
  }

  if (groups.length > maxGroups) {
    lines.push(`- Additional areas: ${groups.length - maxGroups} more groups changed.`);
  }

  return lines;
}

function formatChangedAreas(files, maxExamples = 2, maxGroups = 6) {
  const groups = groupFiles(files);
  if (!groups.length) {
    return ["- No changed areas were reported by git."];
  }

  const lines = [];
  for (const [label, groupedFiles] of groups.slice(0, maxGroups)) {
    const examples = groupedFiles.slice(0, maxExamples);
    const exampleText = examples.length ? `: ${examples.join(", ")}` : "";
    const hiddenCount = groupedFiles.length - examples.length;
    lines.push(`- ${label}: ${groupedFiles.length} file${groupedFiles.length === 1 ? "" : "s"}${exampleText}${hiddenCount > 0 ? `, plus ${hiddenCount} more` : ""}`);
  }

  if (groups.length > maxGroups) {
    lines.push(`- Other areas: ${groups.length - maxGroups} additional group${groups.length - maxGroups === 1 ? "" : "s"}.`);
  }

  return lines;
}

function inferChangeType(commitMessage, subject, stats) {
  const message = `${subject}\n${commitMessage}`;

  if (/BREAKING CHANGE|!:/.test(message)) {
    return "Breaking change";
  }

  if (/^feat(\(.+\))?:/im.test(message)) {
    return "Feature";
  }

  if (/^fix(\(.+\))?:/im.test(message)) {
    return "Bug fix";
  }

  if (/^perf(\(.+\))?:/im.test(message)) {
    return "Performance improvement";
  }

  if (/^test(\(.+\))?:/im.test(message) || stats.files.some((file) => file.replace(/\\/g, "/").startsWith("test/"))) {
    return "Test coverage";
  }

  if (/^docs(\(.+\))?:/im.test(message) || stats.files.some((file) => file.replace(/\\/g, "/").startsWith("src/docs/"))) {
    return "Documentation";
  }

  if (/^ci(\(.+\))?:/im.test(message) || stats.files.some((file) => file.replace(/\\/g, "/").startsWith(".github/"))) {
    return "CI and automation";
  }

  if (/^chore(\(.+\))?:/im.test(message)) {
    return "Maintenance";
  }

  return "Repository update";
}

function extractCommitDetails(commitMessage, subject) {
  const normalizedSubject = String(subject || "").trim();
  const lines = String(commitMessage || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== normalizedSubject)
    .filter((line) => cleanCommitSubject(line) !== normalizedSubject)
    .filter((line) => !/^Signed-off-by:/i.test(line))
    .filter((line) => !/^Co-authored-by:/i.test(line));

  return lines.slice(0, 8);
}

function describeBumpReason(commitMessage, stats, bump) {
  if (bump === "major") {
    if (/BREAKING CHANGE|!:/.test(commitMessage)) {
      return "breaking-change marker in the commit message";
    }

    return `large change footprint (${stats.filesChanged} files, ${stats.totalChanges} total line changes)`;
  }

  if (bump === "minor") {
    if (/^feat(\(.+\))?:/im.test(commitMessage)) {
      return "feature commit marker";
    }

    return `medium change footprint (${stats.filesChanged} files, ${stats.totalChanges} total line changes)`;
  }

  return "patch-level repository update";
}

function formatCommitNotes(details, maxLines = 4) {
  const normalized = details
    .map((line) => line.replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .slice(0, maxLines);

  return normalized.map((line) => `- ${line}`);
}

function buildImpactLine(type, areas, stats) {
  const areaText = areas.length ? areas.join(", ") : "the repository";
  const size =
    stats.filesChanged >= 20 || stats.totalChanges >= 700
      ? "large"
      : stats.filesChanged >= 6 || stats.totalChanges >= 180
        ? "medium"
        : "small";

  return `${type} with a ${size} change footprint across ${areaText}.`;
}

function buildReleaseBody({ sha, subject, fullMessage, stats, bump }) {
  const shortSha = sha.slice(0, 7);
  const areas = summarizeAreas(stats.files);
  const changeType = inferChangeType(fullMessage, subject, stats);
  const details = extractCommitDetails(fullMessage, subject);
  const notes = formatCommitNotes(details, 6);

  return [
    `Automated release for commit \`${shortSha}\`.`,
    "",
    "## Summary",
    "",
    `- Change type: ${changeType}`,
    `- Main change: ${subject || "Repository update"}`,
    `- Impact: ${buildImpactLine(changeType, areas, stats)}`,
    `- Bump reason: ${describeBumpReason(fullMessage, stats, bump)}`,
    "",
    "## Notable changes",
    "",
    ...(notes.length ? notes : [`- ${subject || "Repository update"}`]),
    "",
    "## Changed areas",
    "",
    ...formatChangedAreas(stats.files, 3, 8),
    "",
    "## Release metadata",
    "",
    `- Version bump: ${bump}`,
    `- Files changed: ${stats.filesChanged}`,
    `- Line changes: +${stats.additions} / -${stats.deletions}`,
  ].join("\n");
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildChangelogEntry({ tagName, sha, subject, fullMessage, stats, bump }) {
  const versionLabel = tagName.replace(/^v/, "");
  const shortSha = sha.slice(0, 7);
  const areas = summarizeAreas(stats.files);
  const changeType = inferChangeType(fullMessage, subject, stats);
  const details = extractCommitDetails(fullMessage, subject);
  const notes = formatCommitNotes(details, 4);
  const noteSection = notes.length
    ? [
        "",
        "### Notable Changes",
        "",
        ...notes,
      ]
    : [];

  return [
    `## ${versionLabel} (${getTodayIsoDate()})`,
    "",
    "### Summary",
    "",
    `- Change type: ${changeType}`,
    `- Main change: ${subject || "Repository update"} (${shortSha})`,
    `- Impact: ${buildImpactLine(changeType, areas, stats)}`,
    `- Bump reason: ${describeBumpReason(fullMessage, stats, bump)}`,
    "",
    "### Changed Areas",
    "",
    ...formatChangedAreas(stats.files, 2, 6),
    ...noteSection,
    "",
    "### Release Metrics",
    "",
    `- Version bump: ${bump}`,
    `- Files changed: ${stats.filesChanged}`,
    `- Line changes: +${stats.additions} / -${stats.deletions}`,
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
    const body = buildReleaseBody({ sha, subject, fullMessage, stats, bump });
    changelogEntries.push(buildChangelogEntry({ tagName, sha, subject, fullMessage, stats, bump }));

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
