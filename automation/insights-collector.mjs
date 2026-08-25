import { appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accounts } from "./accounts/index.mjs";
import { runInsightsForAccount } from "./kongi.mjs";

const automationDir = dirname(fileURLToPath(import.meta.url));
const defaultLogDirectory = join(automationDir, "logs", "insights-collector");
const LOG_RETENTION_DAYS = 30;

function sanitizeError(error) {
  return String(error?.message || error || "unknown error")
    .replace(/access_token=[^&\s]+/gi, "access_token=[REDACTED]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]");
}

async function pruneCollectorLogs(logDirectory, now, retentionDays = LOG_RETENTION_DAYS) {
  const cutoff = now.getTime() - retentionDays * 24 * 3_600_000;
  for (const entry of await readdir(logDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name)) continue;
    const path = join(logDirectory, entry.name);
    const metadata = await stat(path);
    if (metadata.mtimeMs < cutoff) await unlink(path);
  }
}

async function writeCollectorLog(entry, { logDirectory = defaultLogDirectory, now = new Date() } = {}) {
  await mkdir(logDirectory, { recursive: true });
  await pruneCollectorLogs(logDirectory, now);
  const path = join(logDirectory, `${now.toISOString().slice(0, 10)}.jsonl`);
  await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
  return path;
}

function summarizeAccountResult(account, result) {
  const posts = Array.isArray(result.posts) ? result.posts : [];
  return {
    account_key: account.accountKey,
    display_name: account.displayName,
    status: result.auth_status === "skipped_locked" ? "skipped" : "completed",
    auth_status: result.auth_status,
    examined_posts: result.examined_posts || 0,
    api_called_posts: result.api_called_posts || 0,
    new_snapshots: result.new_snapshots || 0,
    collected: posts.filter(item => item.status === "collected").map(item => ({
      post_id: item.post_id,
      snapshot_type: item.snapshot?.snapshot_type || null,
      checkpoint: item.snapshot?.checkpoint || null,
      age_hours: item.snapshot?.age_hours ?? null
    })),
    skipped: posts.filter(item => item.status === "skipped").map(item => ({
      post_id: item.post_id || null,
      reason: item.reason || "unknown"
    })),
    errors: posts.filter(item => ["error", "temporary_failure", "permission_missing"].includes(item.status)).map(item => ({
      post_id: item.post_id || null,
      status: item.status,
      error: item.error || null
    }))
  };
}

async function runInsightsCollector({
  accountConfigs = Object.values(accounts),
  collectAccount = runInsightsForAccount,
  logDirectory = defaultLogDirectory,
  now = new Date()
} = {}) {
  const startedAt = new Date();
  const accountResults = [];
  for (const account of accountConfigs) {
    try {
      const result = await collectAccount(account, { silent: true });
      accountResults.push(summarizeAccountResult(account, result));
    } catch (error) {
      accountResults.push({
        account_key: account.accountKey,
        display_name: account.displayName,
        status: "error",
        auth_status: "error",
        examined_posts: 0,
        api_called_posts: 0,
        new_snapshots: 0,
        collected: [],
        skipped: [],
        errors: [{ post_id: null, status: "account_error", error: sanitizeError(error) }]
      });
    }
  }

  const completedAt = new Date();
  const output = {
    run_id: `insights-${startedAt.toISOString().replace(/[:.]/g, "-")}-${process.pid}`,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    accounts: accountResults,
    totals: {
      accounts: accountResults.length,
      examined_posts: accountResults.reduce((sum, item) => sum + item.examined_posts, 0),
      api_called_posts: accountResults.reduce((sum, item) => sum + item.api_called_posts, 0),
      new_snapshots: accountResults.reduce((sum, item) => sum + item.new_snapshots, 0),
      errors: accountResults.reduce((sum, item) => sum + item.errors.length, 0)
    }
  };
  output.log_path = await writeCollectorLog(output, { logDirectory, now });
  return output;
}

export {
  LOG_RETENTION_DAYS,
  defaultLogDirectory,
  runInsightsCollector,
  writeCollectorLog
};
