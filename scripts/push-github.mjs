#!/usr/bin/env node
/**
 * push-github.mjs
 *
 * Pushes a clean snapshot of the bot code to GitHub.
 * Reads GITHUB_TOKEN from environment — no prompts ever needed.
 *
 * Usage:
 *   pnpm run push:github
 *   node scripts/push-github.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────────
const REPO = "Zeta-com/Zeta-AI-";
const BRANCH = "main";
const COMMIT_MSG = "chore: sync latest bot code";

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("❌  GITHUB_TOKEN environment variable is not set.");
  console.error("    Add it to Replit Secrets and retry.");
  process.exit(1);
}

// ── Paths that must NEVER appear in the repo ─────────────────────────────────
const EXCLUDED_DIRS = new Set([
  "node_modules", "dist", ".cache", ".local", ".git",
  "session",       // WhatsApp auth keys
  "sessions",      // Telegram-linked WA sessions
  "data",          // runtime chatbot state
  ".expo", "coverage", "attached_assets",
  "mockup-sandbox", // design sandbox — not needed for deployment
]);
const EXCLUDED_EXTS = new Set([".map", ".tsbuildinfo", ".log"]);

// Root-level files to include
const ROOT_FILES = [
  "package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml",
  "tsconfig.base.json", "tsconfig.json",
  "replit.md", "render.yaml",
  ".gitignore", ".env.example",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function collectFiles(dir, repoBase) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
    if (EXCLUDED_EXTS.has(path.extname(entry.name))) continue;

    const fullPath = path.join(dir, entry.name);
    const repoPath = path.join(repoBase, entry.name).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, repoPath));
    } else {
      results.push({ local: fullPath, repo: repoPath });
    }
  }
  return results;
}

async function gh(endpoint, method = "GET", body = null) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `GitHub ${method} ${endpoint} → ${res.status}: ${json.message ?? JSON.stringify(json)}`
    );
  }
  return json;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n🚀  Pushing to github.com/${REPO} (${BRANCH})\n`);

  // Collect files
  const files = [
    ...ROOT_FILES
      .map((f) => ({ local: path.join(ROOT, f), repo: f }))
      .filter((f) => fs.existsSync(f.local)),
    ...collectFiles(path.join(ROOT, "artifacts/api-server"), "artifacts/api-server"),
    ...collectFiles(path.join(ROOT, "lib"), "lib"),
  ];

  console.log(`📦  ${files.length} files collected\n`);

  // Upload blobs in parallel batches
  const TEXT_EXTS = new Set([
    ".ts", ".tsx", ".js", ".mjs", ".json", ".yaml", ".yml",
    ".md", ".toml", ".css", ".html", ".txt", ".example", ".lock",
  ]);

  const BATCH = 12;
  const treeItems = [];

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const blobs = await Promise.all(
      batch.map(async (f) => {
        const content = fs.readFileSync(f.local);
        const isText =
          TEXT_EXTS.has(path.extname(f.repo)) ||
          f.repo.endsWith(".gitignore") ||
          f.repo.endsWith(".gitkeep");
        const blob = await gh(`/repos/${REPO}/git/blobs`, "POST", {
          content: isText ? content.toString("utf-8") : content.toString("base64"),
          encoding: isText ? "utf-8" : "base64",
        });
        return { path: f.repo, mode: "100644", type: "blob", sha: blob.sha };
      })
    );
    treeItems.push(...blobs);
    process.stdout.write(`  blobs: ${Math.min(i + BATCH, files.length)}/${files.length}\r`);
  }

  console.log(`\n🌳  Creating tree...`);
  const tree = await gh(`/repos/${REPO}/git/trees`, "POST", { tree: treeItems });

  // Get current HEAD sha (if branch exists) to use as parent
  let parentSha = null;
  try {
    const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
    parentSha = ref.object.sha;
  } catch {
    // Branch may not exist yet — fine, create root commit
  }

  console.log(`💾  Creating commit...`);
  const commit = await gh(`/repos/${REPO}/git/commits`, "POST", {
    message: COMMIT_MSG,
    tree: tree.sha,
    ...(parentSha ? { parents: [parentSha] } : { parents: [] }),
  });

  // Update or create the branch ref
  try {
    await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, "PATCH", {
      sha: commit.sha,
      force: true,
    });
  } catch {
    await gh(`/repos/${REPO}/git/refs`, "POST", {
      ref: `refs/heads/${BRANCH}`,
      sha: commit.sha,
    });
  }

  console.log(`\n✅  Done!`);
  console.log(`🔗  https://github.com/${REPO}/commit/${commit.sha.slice(0, 7)}`);
  console.log(`    https://github.com/${REPO}\n`);
})().catch((err) => {
  console.error("\n❌  Push failed:", err.message);
  process.exit(1);
});
