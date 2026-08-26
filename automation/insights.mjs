import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const automationDir = dirname(fileURLToPath(import.meta.url));
const postsDir = join(automationDir, "posts");
const statePath = join(automationDir, "state.json");
const summaryPath = join(automationDir, "insights-summary.json");
const METRICS = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"];
const CHECKPOINTS = [
  { name: "24h", hours: 24 },
  { name: "72h", hours: 72 },
  { name: "7d", hours: 168 }
];

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function resolveContext(context = {}) {
  const accountKey = context.accountKey || "kongi";
  const resolvedSummaryPath = context.summaryPath || summaryPath;
  return {
    accountKey,
    displayName: context.displayName || "콩이",
    postsDir: context.postsDir || postsDir,
    statePath: context.statePath || statePath,
    summaryPath: resolvedSummaryPath,
    lockPath: context.lockPath || join(dirname(resolvedSummaryPath), `.${accountKey}-collector.lock`),
    accessToken: context.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? "",
    accessTokenEnv: context.accessTokenEnv || "INSTAGRAM_ACCESS_TOKEN"
  };
}

function postPath(postId, context = {}) {
  const resolved = resolveContext(context);
  return join(resolved.postsDir, `${String(postId).toLowerCase().replace(/[^a-z0-9-]/g, "-")}.json`);
}

function sanitizeMessage(message, accessToken = "") {
  let result = String(message || "unknown error");
  const token = accessToken || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (token) result = result.split(token).join("[REDACTED]");
  return result.replace(/access_token=[^&\s]+/gi, "access_token=[REDACTED]");
}

function metricValue(snapshot, metric) {
  const item = snapshot?.metrics?.[metric];
  return item?.status === "ok" && typeof item.value === "number" ? item.value : null;
}

function safeRate(numerator, reach) {
  return typeof numerator === "number" && typeof reach === "number" && reach > 0
    ? Number((numerator / reach).toFixed(6))
    : null;
}

function deriveRates(metrics) {
  const reach = metrics?.reach?.status === "ok" ? metrics.reach.value : null;
  const value = name => metrics?.[name]?.status === "ok" ? metrics[name].value : null;
  return {
    like_rate: safeRate(value("likes"), reach),
    comment_rate: safeRate(value("comments"), reach),
    save_rate: safeRate(value("saved"), reach),
    share_rate: safeRate(value("shares"), reach),
    interaction_rate: safeRate(value("total_interactions"), reach)
  };
}

function samplePolicy(count) {
  if (count < 5) return { level: "collect_only", performance_weight: 0, planning_use: false };
  if (count < 10) return { level: "weak_signal", performance_weight: 0.15, planning_use: true };
  if (count < 20) return { level: "meaningful", performance_weight: 0.35, planning_use: true };
  return { level: "stronger", performance_weight: 0.5, planning_use: true };
}

function ageHours(publishedAt, now = new Date()) {
  const milliseconds = now.getTime() - new Date(publishedAt).getTime();
  return Number((Math.max(0, milliseconds) / 3_600_000).toFixed(2));
}

function collectionPlan(post, now = new Date(), minimumHours = 12) {
  const snapshots = post.insights?.snapshots || [];
  const age = ageHours(post.published_at, now);
  const recorded = new Set(snapshots.map(item => item.checkpoint).filter(Boolean));
  const due = CHECKPOINTS.find(item => age >= item.hours && !recorded.has(item.name));
  if (due) return { snapshot_type: "checkpoint", checkpoint: due.name, age_hours: age };
  if (!snapshots.length) return { snapshot_type: "initial", checkpoint: null, age_hours: age };
  if (recorded.has("7d")) return null;
  const last = new Date(snapshots.at(-1).collected_at);
  if ((now.getTime() - last.getTime()) / 3_600_000 >= minimumHours) {
    return { snapshot_type: "latest", checkpoint: null, age_hours: age };
  }
  return null;
}

function collectionSkipReason(post, now = new Date(), minimumHours = 12) {
  const snapshots = post.insights?.snapshots || [];
  const recorded = new Set(snapshots.map(item => item.checkpoint).filter(Boolean));
  if (recorded.has("7d")) return "checkpoint_7d_complete";
  if (!snapshots.length) return null;
  const last = new Date(snapshots.at(-1).collected_at);
  if (Number.isNaN(last.getTime())) return "invalid_last_collected_at";
  const elapsed = (now.getTime() - last.getTime()) / 3_600_000;
  return elapsed < minimumHours ? "minimum_interval_not_elapsed" : "not_due";
}

async function acquireCollectorLock(path, staleMilliseconds = 2 * 3_600_000) {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() })}\n`, "utf8");
      return async () => {
        await handle.close().catch(() => {});
        await unlink(path).catch(error => {
          if (error.code !== "ENOENT") throw error;
        });
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let stale = false;
      try {
        const metadata = await stat(path);
        stale = Date.now() - metadata.mtimeMs > staleMilliseconds;
      } catch (statError) {
        if (statError.code !== "ENOENT") throw statError;
        continue;
      }
      if (!stale || attempt > 0) return null;
      await unlink(path).catch(error => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
  return null;
}

function classifyMetaError(error, status, accessToken) {
  const code = Number(error?.code || 0);
  const message = sanitizeMessage(error?.message || `HTTP ${status}`, accessToken);
  if (code === 190 || code === 102 || /expired|invalid.*token|oauth.*token|access token/i.test(message)) {
    return { status: "auth_error", code, message };
  }
  if (code === 10 || code === 200 || /permission|manage_insights|not authorized/i.test(message)) {
    return { status: "permission_error", value: null, code, message };
  }
  if (code === 100 || /unsupported|not supported|not available|invalid metric/i.test(message)) {
    return { status: "unsupported", value: null, code, message };
  }
  return { status: "error", value: null, code: code || status, message };
}

async function fetchMetric(mediaId, metric, context = {}) {
  const resolved = resolveContext(context);
  const base = (process.env.META_GRAPH_BASE_URL || "https://graph.instagram.com").replace(/\/$/, "");
  const version = process.env.META_API_VERSION;
  if (!/^v\d+\.\d+$/.test(version || "")) throw new Error("META_API_VERSION 형식이 올바르지 않습니다.");
  const url = new URL(`${base}/${version}/${encodeURIComponent(mediaId)}/insights`);
  url.searchParams.set("metric", metric);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${resolved.accessToken}` },
      signal: AbortSignal.timeout(20_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) return classifyMetaError(payload.error, response.status, resolved.accessToken);
    const item = Array.isArray(payload.data) ? payload.data[0] : null;
    let value = null;
    if (item?.total_value && Object.hasOwn(item.total_value, "value")) value = item.total_value.value;
    else if (Array.isArray(item?.values) && item.values.length) value = item.values.at(-1)?.value ?? null;
    return { status: "ok", value: typeof value === "number" ? value : null };
  } catch (error) {
    return { status: "error", value: null, code: "network", message: sanitizeMessage(error.message, resolved.accessToken) };
  }
}

async function collectMetrics(mediaId, context = {}) {
  const metrics = {};
  for (const metric of METRICS) metrics[metric] = await fetchMetric(mediaId, metric, context);
  return metrics;
}

async function metadataFromCurrentState(context = {}) {
  const resolved = resolveContext(context);
  const state = await readJson(resolved.statePath, null);
  if (!state?.post_id || !state?.instagram_media_id || state.stage !== "instagram_published") return null;
  const draft = state.run_dir ? await readJson(join(state.run_dir, "draft.json"), {}) : {};
  return {
    account_key: resolved.accountKey,
    post_id: state.post_id,
    title: draft.title || state.title || "",
    idea_category: draft.idea_category || draft.category || "미분류",
    idea_summary: draft.idea_summary || draft.description || "",
    idea_source: state.idea_source || draft.idea_source || null,
    trend_concept_id: state.trend_concept_id || draft.trend_concept_id || null,
    owner_mode: state.owner_mode || draft.owner_mode || "none",
    owner_asset_used: state.owner_asset_used === true || draft.owner_asset_used === true,
    post_format: state.post_format || draft.post_format || "single",
    slide_count: Number(state.slide_count || draft.preferred_slide_count || 1),
    total_score: state.trend_total_score ?? draft.trend_total_score ?? null,
    evidence_strength: state.trend_evidence_strength ?? draft.trend_evidence_strength ?? null,
    momentum: state.trend_momentum || draft.trend_momentum || null,
    published_at: state.updated_at,
    instagram_media_id: state.instagram_media_id,
    instagram_media_type: state.public_cta_image_url ? "CAROUSEL" : null,
    git_commit: state.git_commit || null,
    public_image_url: state.public_image_url || null,
    public_content_image_urls: state.public_content_image_urls || (state.public_image_url ? [state.public_image_url] : []),
    public_cta_image_url: state.public_cta_image_url || null,
    insights: { snapshots: [] }
  };
}

async function listPosts(context = {}) {
  const resolved = resolveContext(context);
  await mkdir(resolved.postsDir, { recursive: true });
  const current = await metadataFromCurrentState(resolved);
  if (current && !(await readJson(postPath(current.post_id, resolved), null))) await writeJson(postPath(current.post_id, resolved), current);
  const files = (await readdir(resolved.postsDir)).filter(name => name.endsWith(".json"));
  const posts = [];
  for (const file of files) {
    const post = await readJson(join(resolved.postsDir, file), null);
    if (!post?.post_id || !post?.instagram_media_id || !post?.published_at) continue;
    if (post.account_key && post.account_key !== resolved.accountKey) continue;
    if (!post.account_key) {
      post.account_key = resolved.accountKey;
      await writeJson(join(resolved.postsDir, file), post);
    }
    posts.push(post);
  }
  return posts.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
}

function average(values) {
  const valid = values.filter(value => typeof value === "number");
  return valid.length ? Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(6)) : null;
}

function buildSummary(posts) {
  const measured = posts.filter(post => post.insights?.snapshots?.length);
  const categories = {};
  for (const post of measured) {
    const latest = post.insights.snapshots.at(-1);
    const category = post.idea_category || "미분류";
    const bucket = categories[category] ||= { posts: [] };
    bucket.posts.push({ post, latest });
  }
  const categorySummary = Object.fromEntries(Object.entries(categories).map(([name, bucket]) => {
    const metricAverage = metric => average(bucket.posts.map(({ latest }) => metricValue(latest, metric)));
    const rateAverage = rate => average(bucket.posts.map(({ latest }) => latest.derived?.[rate] ?? null));
    return [name, {
      post_count: bucket.posts.length,
      confidence: bucket.posts.length === 1 ? "very_low" : bucket.posts.length < 5 ? "low" : "usable",
      average_reach: metricAverage("reach"),
      average_views: metricAverage("views"),
      average_likes: metricAverage("likes"),
      average_saved: metricAverage("saved"),
      average_shares: metricAverage("shares"),
      average_save_rate: rateAverage("save_rate"),
      average_share_rate: rateAverage("share_rate"),
      average_interaction_rate: rateAverage("interaction_rate")
    }];
  }));
  const best = rate => measured
    .map(post => ({ post_id: post.post_id, value: post.insights.snapshots.at(-1).derived?.[rate] ?? null }))
    .filter(item => typeof item.value === "number")
    .sort((a, b) => b.value - a.value)[0] || null;
  const policy = samplePolicy(measured.length);
  return {
    generated_at: new Date().toISOString(),
    measured_post_count: measured.length,
    sample_policy: policy,
    idea_selection: {
      use_performance: policy.planning_use,
      performance_weight: policy.performance_weight,
      exploitation_target: 0.75,
      exploration_target: 0.25,
      guidance: policy.level === "collect_only"
        ? "표본이 4개 이하이므로 성과는 수집만 하고 아이디어 선택에는 강하게 반영하지 않습니다."
        : "저장·공유 비율을 좋아요보다 우선 신호로 참고하되 신선도와 탐색 가치를 함께 평가합니다."
    },
    best_save_rate: best("save_rate"),
    best_share_rate: best("share_rate"),
    categories: categorySummary
  };
}

async function savePublishedPostMetadata({ draft, state, context = {} }) {
  const resolved = resolveContext(context);
  const path = postPath(draft.post_id, resolved);
  const previous = await readJson(path, {});
  const metadata = {
    ...previous,
    account_key: resolved.accountKey,
    post_id: draft.post_id,
    title: draft.title,
    idea_category: draft.idea_category || draft.category || "미분류",
    idea_summary: draft.idea_summary || draft.description || "",
    idea_source: state.idea_source || draft.idea_source || previous.idea_source || null,
    trend_concept_id: state.trend_concept_id || draft.trend_concept_id || previous.trend_concept_id || null,
    owner_mode: state.owner_mode || draft.owner_mode || previous.owner_mode || "none",
    owner_asset_used: state.owner_asset_used === true || draft.owner_asset_used === true || previous.owner_asset_used === true,
    post_format: state.post_format || draft.post_format || previous.post_format || "single",
    slide_count: Number(state.slide_count || draft.preferred_slide_count || previous.slide_count || 1),
    total_score: state.trend_total_score ?? draft.trend_total_score ?? previous.total_score ?? null,
    evidence_strength: state.trend_evidence_strength ?? draft.trend_evidence_strength ?? previous.evidence_strength ?? null,
    momentum: state.trend_momentum || draft.trend_momentum || previous.momentum || null,
    published_at: previous.published_at || state.updated_at || new Date().toISOString(),
    instagram_media_id: state.instagram_media_id,
    instagram_media_type: state.public_cta_image_url ? "CAROUSEL" : previous.instagram_media_type || null,
    git_commit: state.git_commit || null,
    public_image_url: state.public_image_url || null,
    public_content_image_urls: state.public_content_image_urls || (state.public_image_url ? [state.public_image_url] : []),
    public_cta_image_url: state.public_cta_image_url || null,
    insights: previous.insights || { snapshots: [] }
  };
  await writeJson(path, metadata);
  return path;
}

async function updateInstagramInsightsUnlocked({ now = new Date(), context = {} } = {}) {
  const resolved = resolveContext(context);
  const missing = [
    !resolved.accessToken && resolved.accessTokenEnv,
    !process.env.META_API_VERSION && "META_API_VERSION"
  ].filter(Boolean);
  if (missing.length) {
    const posts = await listPosts(resolved);
    const summary = buildSummary(posts);
    await writeJson(resolved.summaryPath, summary);
    return {
      account_key: resolved.accountKey,
      auth_status: "not_configured",
      missing,
      examined_posts: posts.length,
      checked_posts: 0,
      api_called_posts: 0,
      new_snapshots: 0,
      posts: posts.map(post => ({ post_id: post.post_id, status: "skipped", reason: "credentials_not_configured" })),
      summary,
      summary_path: resolved.summaryPath
    };
  }

  const posts = await listPosts(resolved);
  const minimumHours = Math.max(1, Number(process.env.INSIGHTS_LATEST_MIN_HOURS || 12));
  let checkedPosts = 0;
  let apiCalledPosts = 0;
  let newSnapshots = 0;
  const postResults = [];
  for (const post of posts) {
    try {
      const plan = collectionPlan(post, now, minimumHours);
      if (!plan) {
        postResults.push({
          post_id: post.post_id,
          status: "skipped",
          reason: collectionSkipReason(post, now, minimumHours) || "not_due"
        });
        continue;
      }
      checkedPosts += 1;
      apiCalledPosts += 1;
      const metrics = await collectMetrics(post.instagram_media_id, resolved);
      const authError = Object.values(metrics).find(item => item.status === "auth_error");
      if (authError) {
        const error = new Error(`Instagram Insights 인증 실패: ${authError.message}`);
        error.kind = "auth_invalid";
        throw error;
      }
      const permissionError = Object.values(metrics).find(item => item.status === "permission_error");
      if (permissionError) {
        postResults.push({ post_id: post.post_id, status: "permission_missing", required_permission: "instagram_business_manage_insights" });
        continue;
      }
      const supportedCount = Object.values(metrics).filter(item => item.status === "ok").length;
      const unsupportedCount = Object.values(metrics).filter(item => item.status === "unsupported").length;
      if (!supportedCount && unsupportedCount !== METRICS.length) {
        const metricError = Object.values(metrics).find(item => item.message);
        postResults.push({
          post_id: post.post_id,
          status: "temporary_failure",
          error: metricError ? sanitizeMessage(metricError.message, resolved.accessToken) : "No supported metric response"
        });
        continue;
      }
      const snapshot = {
        collected_at: now.toISOString(),
        age_hours: plan.age_hours,
        snapshot_type: plan.snapshot_type,
        checkpoint: plan.checkpoint,
        metrics,
        derived: deriveRates(metrics)
      };
      post.insights ||= { snapshots: [] };
      post.insights.snapshots.push(snapshot);
      await writeJson(postPath(post.post_id, resolved), post);
      newSnapshots += 1;
      postResults.push({ post_id: post.post_id, status: "collected", snapshot });
    } catch (error) {
      if (error.kind === "auth_invalid") throw error;
      postResults.push({
        post_id: post.post_id,
        status: "error",
        error: sanitizeMessage(error.message, resolved.accessToken)
      });
    }
  }
  const refreshed = await listPosts(resolved);
  const summary = buildSummary(refreshed);
  await writeJson(resolved.summaryPath, summary);
  const authStatus = !checkedPosts
    ? "not_checked_no_due_posts"
    : postResults.some(item => item.status === "permission_missing")
      ? "permission_missing"
      : postResults.some(item => ["temporary_failure", "error"].includes(item.status)) && !newSnapshots
        ? "temporary_failure"
        : "verified";
  return {
    account_key: resolved.accountKey,
    auth_status: authStatus,
    examined_posts: posts.length,
    checked_posts: checkedPosts,
    api_called_posts: apiCalledPosts,
    new_snapshots: newSnapshots,
    supported_metrics: [...new Set(postResults.flatMap(result => result.snapshot ? METRICS.filter(metric => result.snapshot.metrics[metric]?.status === "ok") : []))],
    posts: postResults,
    summary,
    posts_dir: resolved.postsDir,
    summary_path: resolved.summaryPath
  };
}

async function updateInstagramInsights({ now = new Date(), context = {} } = {}) {
  const resolved = resolveContext(context);
  const releaseLock = await acquireCollectorLock(resolved.lockPath);
  if (!releaseLock) {
    return {
      account_key: resolved.accountKey,
      auth_status: "skipped_locked",
      examined_posts: 0,
      checked_posts: 0,
      api_called_posts: 0,
      new_snapshots: 0,
      posts: [{ status: "skipped", reason: "collector_already_running" }],
      summary: await readJson(resolved.summaryPath, null),
      summary_path: resolved.summaryPath
    };
  }
  try {
    return await updateInstagramInsightsUnlocked({ now, context: resolved });
  } finally {
    await releaseLock();
  }
}

export {
  CHECKPOINTS,
  METRICS,
  buildSummary,
  collectionPlan,
  collectionSkipReason,
  deriveRates,
  postsDir,
  samplePolicy,
  savePublishedPostMetadata,
  summaryPath,
  updateInstagramInsights
};
