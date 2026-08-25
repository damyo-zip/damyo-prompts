import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInsightsCollector } from "./insights-collector.mjs";
import { updateInstagramInsights } from "./insights.mjs";

const temporaryDirectory = await mkdtemp(join(tmpdir(), "damyo-insights-collector-"));
const called = [];
const configs = [
  { accountKey: "broken", displayName: "실패 계정" },
  { accountKey: "healthy", displayName: "정상 계정" }
];

try {
  const result = await runInsightsCollector({
    accountConfigs: configs,
    logDirectory: temporaryDirectory,
    now: new Date("2026-08-26T00:00:00.000Z"),
    collectAccount: async account => {
      called.push(account.accountKey);
      if (account.accountKey === "broken") throw new Error("synthetic account failure");
      return {
        auth_status: "verified",
        examined_posts: 2,
        api_called_posts: 1,
        new_snapshots: 1,
        posts: [
          { post_id: "P-TEST-1", status: "collected", snapshot: { snapshot_type: "checkpoint", checkpoint: "24h", age_hours: 25 } },
          { post_id: "P-TEST-2", status: "skipped", reason: "minimum_interval_not_elapsed" }
        ]
      };
    }
  });

  assert.deepEqual(called, ["broken", "healthy"]);
  assert.equal(result.accounts[0].status, "error");
  assert.equal(result.accounts[1].status, "completed");
  assert.equal(result.totals.new_snapshots, 1);
  assert.equal(result.totals.errors, 1);
  const log = await readFile(join(temporaryDirectory, "2026-08-26.jsonl"), "utf8");
  assert.match(log, /synthetic account failure/);
  assert.match(log, /minimum_interval_not_elapsed/);

  const lockedRuntime = join(temporaryDirectory, "locked-runtime");
  const lockedPosts = join(lockedRuntime, "posts");
  const lockPath = join(lockedRuntime, "collector.lock");
  await mkdir(lockedPosts, { recursive: true });
  await writeFile(lockPath, "active lock\n", "utf8");
  const locked = await updateInstagramInsights({
    context: {
      accountKey: "locked",
      postsDir: lockedPosts,
      statePath: join(lockedRuntime, "state.json"),
      summaryPath: join(lockedRuntime, "summary.json"),
      lockPath
    }
  });
  assert.equal(locked.auth_status, "skipped_locked");
  assert.equal(locked.posts[0].reason, "collector_already_running");

  const isolatedRuntime = join(temporaryDirectory, "post-isolation");
  const isolatedPosts = join(isolatedRuntime, "posts");
  await mkdir(isolatedPosts, { recursive: true });
  const postTemplate = mediaId => ({
    account_key: "isolated",
    post_id: `P-${mediaId.toUpperCase()}`,
    published_at: "2026-08-25T23:00:00.000Z",
    instagram_media_id: mediaId,
    insights: { snapshots: [] }
  });
  await writeFile(join(isolatedPosts, "p-bad.json"), `${JSON.stringify(postTemplate("bad"))}\n`, "utf8");
  await writeFile(join(isolatedPosts, "p-good.json"), `${JSON.stringify(postTemplate("good"))}\n`, "utf8");
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url.includes("/bad/")) {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: { code: 1, message: "synthetic media failure" } }));
      return;
    }
    response.end(JSON.stringify({ data: [{ values: [{ value: 1 }] }] }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const previousBase = process.env.META_GRAPH_BASE_URL;
  const previousVersion = process.env.META_API_VERSION;
  try {
    process.env.META_GRAPH_BASE_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.META_API_VERSION = "v25.0";
    const isolated = await updateInstagramInsights({
      now: new Date("2026-08-26T00:00:00.000Z"),
      context: {
        accountKey: "isolated",
        postsDir: isolatedPosts,
        statePath: join(isolatedRuntime, "state.json"),
        summaryPath: join(isolatedRuntime, "summary.json"),
        lockPath: join(isolatedRuntime, "collector.lock"),
        accessToken: "test-token",
        accessTokenEnv: "TEST_TOKEN"
      }
    });
    assert.equal(isolated.api_called_posts, 2);
    assert.equal(isolated.new_snapshots, 1);
    assert.equal(isolated.posts.find(item => item.post_id === "P-BAD").status, "temporary_failure");
    assert.equal(isolated.posts.find(item => item.post_id === "P-GOOD").status, "collected");
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousBase == null) delete process.env.META_GRAPH_BASE_URL;
    else process.env.META_GRAPH_BASE_URL = previousBase;
    if (previousVersion == null) delete process.env.META_API_VERSION;
    else process.env.META_API_VERSION = previousVersion;
  }
  console.log(JSON.stringify({ ok: true, tested: ["account_isolation", "post_isolation", "skip_logging", "checkpoint_logging", "concurrent_lock"] }, null, 2));
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
