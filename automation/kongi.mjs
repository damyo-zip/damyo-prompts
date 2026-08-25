import { constants as fsConstants } from "node:fs";
import {
  access,
  appendFile,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import {
  collectionPlan,
  deriveRates,
  samplePolicy,
  savePublishedPostMetadata,
  updateInstagramInsights
} from "./insights.mjs";

const automationDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(automationDir);
const promptsPath = join(projectRoot, "prompts.js");
const referencePath = join(automationDir, "reference", "kongi.png");
const statePath = join(automationDir, "state.json");
const runsDir = join(automationDir, "runs");
const logsDir = join(automationDir, "logs");
const backupsDir = join(automationDir, "backups");
const MAX_ATTEMPTS = 3;

function hasFlag(name) {
  return process.argv.includes(name);
}

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function booleanValue(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function localTimestamp(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, value, "utf8");
  await rename(tempPath, path);
}

async function writeJson(path, value) {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function loadEnv() {
  const envPath = join(projectRoot, ".env");
  if (!(await exists(envPath))) return;
  const source = await readFile(envPath, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(" ")} 실패: ${(result.stderr || result.stdout).trim()}`);
  }
  return { status: result.status, stdout: result.stdout.trimEnd(), stderr: result.stderr.trim() };
}

function gitSnapshot() {
  return {
    status: runGit(["status", "--porcelain=v1", "--untracked-files=all"]).stdout,
    branch: runGit(["branch", "--show-current"]).stdout,
    remotes: runGit(["remote", "-v"]).stdout,
    head: runGit(["rev-parse", "HEAD"]).stdout
  };
}

function parsePromptsSource(source) {
  const context = Object.create(null);
  vm.createContext(context);
  vm.runInContext(`${source}\n;globalThis.__KONGI_DATA__ = { SITE_CONFIG, PROMPTS };`, context, {
    timeout: 2000,
    filename: "prompts.js"
  });
  const data = context.__KONGI_DATA__;
  if (!data || !Array.isArray(data.PROMPTS)) throw new Error("prompts.js에서 PROMPTS 배열을 읽지 못했습니다.");
  return JSON.parse(JSON.stringify(data));
}

async function readSiteData() {
  const source = await readFile(promptsPath, "utf8");
  return { source, ...parsePromptsSource(source) };
}

function getAnimal(item) {
  return ["cat", "dog", "small"].includes(item?.animal) ? item.animal : "cat";
}

function idNumber(id) {
  const match = String(id || "").match(/^P-(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function nextPostId(prompts) {
  const max = prompts.reduce((value, item) => Math.max(value, idNumber(item.id)), 0);
  return `P-${String(max + 1).padStart(3, "0")}`;
}

function summarizeSite(prompts) {
  const ids = prompts.map(item => item.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  return {
    count: prompts.length,
    max_id: prompts.reduce((best, item) => idNumber(item.id) > idNumber(best) ? item.id : best, "P-000"),
    next_id: nextPostId(prompts),
    duplicate_ids: [...new Set(duplicateIds)],
    animals: Object.fromEntries(["cat", "dog", "small"].map(animal => [
      animal,
      prompts.filter(item => getAnimal(item) === animal).length
    ])),
    dogs: prompts.filter(item => getAnimal(item) === "dog").map(item => ({
      id: item.id,
      title: item.title || "",
      category: item.category || "",
      description: item.description || "",
      prompt: item.prompt || ""
    }))
  };
}

async function appendLog(runId, stage, details = {}) {
  await mkdir(logsDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const entry = { timestamp: new Date().toISOString(), run_id: runId, stage, ...details };
  await appendFile(join(logsDir, `${day}.jsonl`), `${JSON.stringify(entry)}\n`, "utf8");
}

async function updateState(runId, stage, details = {}) {
  const previous = await readJson(statePath, {});
  const next = {
    ...previous,
    ...details,
    run_id: runId,
    stage,
    updated_at: new Date().toISOString()
  };
  await writeJson(statePath, next);
  await appendLog(runId, stage, details);
  return next;
}

function activeState(state) {
  return state && state.run_id && ![
    "completed",
    "dry_run_complete",
    "failed",
    "instagram_published"
  ].includes(state.stage);
}

function assertCleanGit(snapshot, allowDevelopmentDirty) {
  if (snapshot.status && !allowDevelopmentDirty) {
    throw new Error(`기존 미커밋 변경사항이 있어 자동 게시를 안전하게 중단함:\n${snapshot.status}`);
  }
  if (!snapshot.branch) throw new Error("현재 Git branch를 확인하지 못했습니다.");
  if (!snapshot.remotes) throw new Error("Git remote가 설정되어 있지 않습니다.");
}

async function commandInspect() {
  const { PROMPTS } = await readSiteData();
  console.log(JSON.stringify({
    project_root: projectRoot,
    reference_image: referencePath,
    reference_exists: await exists(referencePath),
    git: gitSnapshot(),
    site: summarizeSite(PROMPTS)
  }, null, 2));
}

async function commandPreflight() {
  const allowDevelopmentDirty = hasFlag("--development-dirty") && booleanValue(process.env.DRY_RUN, true);
  let performanceUpdate;
  try {
    performanceUpdate = await updateInstagramInsights();
  } catch (error) {
    if (error.kind === "auth_invalid") throw error;
    performanceUpdate = { auth_status: "temporary_failure", error: error.message };
    await appendLog("insights-update", "insights_failed", { error: error.message });
  }

  const snapshot = gitSnapshot();
  assertCleanGit(snapshot, allowDevelopmentDirty);
  if (!(await exists(referencePath))) throw new Error(`콩이 기준 이미지가 없습니다: ${referencePath}`);

  const { PROMPTS } = await readSiteData();
  const site = summarizeSite(PROMPTS);
  if (site.duplicate_ids.length) throw new Error(`중복 ID가 있습니다: ${site.duplicate_ids.join(", ")}`);

  const previous = await readJson(statePath, null);
  const runId = activeState(previous) ? previous.run_id : `${localTimestamp()}-${randomSuffix()}`;
  const postId = activeState(previous) ? previous.post_id : site.next_id;
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });
  const payload = {
    run_id: runId,
    post_id: postId,
    run_dir: runDir,
    dry_run: booleanValue(process.env.DRY_RUN, true),
    baseline_commit: activeState(previous) ? previous.baseline_commit : snapshot.head,
    existing_count: site.count,
    existing_dog_posts: site.dogs,
    performance_context: performanceUpdate.summary || null,
    insights_update: {
      auth_status: performanceUpdate.auth_status,
      checked_posts: performanceUpdate.checked_posts || 0,
      new_snapshots: performanceUpdate.new_snapshots || 0,
      error: performanceUpdate.error || null
    },
    performance_report: performanceUpdate.summary ? {
      measured_post_count: performanceUpdate.summary.measured_post_count,
      best_save_rate: performanceUpdate.summary.best_save_rate,
      best_share_rate: performanceUpdate.summary.best_share_rate,
      planning_use: performanceUpdate.summary.idea_selection?.use_performance || false,
      guidance: performanceUpdate.summary.idea_selection?.guidance || null
    } : null,
    reference_image: referencePath,
    git: snapshot
  };
  await writeJson(join(runDir, "preflight.json"), payload);
  await updateState(runId, "preflight_complete", {
    post_id: postId,
    dry_run: payload.dry_run,
    baseline_commit: payload.baseline_commit,
    existing_count: site.count,
    run_dir: runDir,
    insights_update: payload.insights_update,
    performance_report: payload.performance_report
  });
  console.log(JSON.stringify(payload, null, 2));
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 값이 비어 있습니다.`);
}

function validateDraft(draft, expectedPostId) {
  for (const key of ["run_id", "post_id", "title", "category", "description", "prompt", "generation_prompt", "caption", "alt_text"]) {
    assertNonEmptyString(draft[key], `draft.${key}`);
  }
  if (expectedPostId && draft.post_id !== expectedPostId) {
    throw new Error(`초안 post_id(${draft.post_id})가 실행 ID의 post_id(${expectedPostId})와 다릅니다.`);
  }
  if (/콩이/.test(draft.prompt)) throw new Error("공유용 prompt에는 특정 이름 '콩이'를 넣을 수 없습니다.");
  const requiredPatterns = [
    [/첨부한|사진 속/, "첨부 이미지 지시"],
    [/같은|동일/, "동일 개체 유지"],
    [/털색/, "털색 유지"],
    [/무늬/, "무늬 유지"],
    [/얼굴형|얼굴/, "얼굴 유지"],
    [/눈/, "눈 유지"],
    [/코/, "코 유지"],
    [/귀/, "귀 유지"],
    [/주인공/, "반려동물 주인공"],
    [/구도|카메라/, "카메라 구도"],
    [/조명|빛/, "조명"],
    [/배경/, "배경"],
    [/분위기/, "분위기"],
    [/왜곡|비정상|정상/, "신체 왜곡 방지"],
    [/글자|텍스트/, "불필요한 글자 제외"],
    [/워터마크/, "워터마크 제외"],
    [/SNS/, "SNS UI 제외"],
    [/4:5/, "4:5 비율"]
  ];
  const missing = requiredPatterns.filter(([pattern]) => !pattern.test(draft.prompt)).map(([, label]) => label);
  if (missing.length) throw new Error(`공유용 prompt 필수 요소 누락: ${missing.join(", ")}`);
  if (draft.caption.length > 2200) throw new Error("Instagram 캡션이 2,200자를 초과합니다.");
  return true;
}

function validateReview(review, runId) {
  if (review.run_id !== runId) throw new Error("review.run_id가 draft.run_id와 다릅니다.");
  if (!Number.isInteger(review.attempt) || review.attempt < 1 || review.attempt > MAX_ATTEMPTS) {
    throw new Error(`review.attempt는 1~${MAX_ATTEMPTS} 정수여야 합니다.`);
  }
  for (const key of ["identity_score", "visual_quality_score", "concept_score"]) {
    if (typeof review[key] !== "number" || review[key] < 0 || review[key] > 100) {
      throw new Error(`review.${key}는 0~100 숫자여야 합니다.`);
    }
  }
  if (typeof review.fatal_issue !== "boolean") throw new Error("review.fatal_issue는 boolean이어야 합니다.");
  assertNonEmptyString(review.notes, "review.notes");
  return {
    passed: review.identity_score >= 75 &&
      review.visual_quality_score >= 80 &&
      review.concept_score >= 80 &&
      review.fatal_issue === false,
    thresholds: { identity_score: 75, visual_quality_score: 80, concept_score: 80, fatal_issue: false }
  };
}

async function imageMetadata(path) {
  const buffer = await readFile(path);
  if (buffer.length < 24) throw new Error("이미지 파일이 너무 작거나 손상되었습니다.");
  if (buffer.subarray(1, 4).toString("ascii") === "PNG") {
    return { format: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { format: "jpeg", height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), bytes: buffer.length };
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  throw new Error("지원하지 않거나 손상된 이미지입니다. PNG 또는 JPEG를 사용하세요.");
}

function makePost(draft, imageSrc) {
  return {
    id: draft.post_id,
    animal: "dog",
    title: draft.title.trim(),
    category: draft.category.trim(),
    cover: imageSrc,
    description: draft.description.trim(),
    prompt: draft.prompt.trim(),
    images: [{ src: imageSrc }]
  };
}

function validateSite(prompts, post, previousCount, projectImageExists) {
  if (!Array.isArray(prompts)) throw new Error("PROMPTS 배열이 아닙니다.");
  if (prompts.length !== previousCount + 1) throw new Error("기존 게시물 개수가 손상되었습니다.");
  if (prompts[0]?.id !== post.id) throw new Error("새 게시물이 PROMPTS 앞쪽에 추가되지 않았습니다.");
  if (prompts.filter(item => item.id === post.id).length !== 1) throw new Error("새 ID가 중복되었습니다.");
  if (post.animal !== "dog") throw new Error("animal은 dog여야 합니다.");
  if (!post.cover || post.cover !== post.images?.[0]?.src) throw new Error("cover와 images[0].src가 일치하지 않습니다.");
  if (!projectImageExists) throw new Error("새 이미지 파일이 존재하지 않습니다.");
  return true;
}

function replacePromptsArray(source, prompts) {
  const marker = "const PROMPTS =";
  const start = source.indexOf(marker);
  if (start < 0) throw new Error("prompts.js에서 PROMPTS 선언을 찾지 못했습니다.");
  return `${source.slice(0, start)}${marker} ${JSON.stringify(prompts, null, 2)};\n`;
}

function assertOnlyExpectedChanges(expectedPaths) {
  const lines = runGit(["status", "--porcelain=v1", "--untracked-files=all"]).stdout.split(/\r?\n/).filter(Boolean);
  const actual = lines.map(line => line.slice(3).replace(/\\/g, "/"));
  const unexpected = actual.filter(path => !expectedPaths.includes(path));
  if (unexpected.length) throw new Error(`자동화 범위 밖의 변경이 감지되었습니다: ${unexpected.join(", ")}`);
}

function inferPublicBaseUrl() {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/?$/, "/");
  const remote = runGit(["config", "--get", "remote.origin.url"]).stdout;
  const match = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) throw new Error("PUBLIC_SITE_URL을 추론하지 못했습니다. .env에 설정하세요.");
  const [, owner, repository] = match;
  return repository.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${repository}/`;
}

async function verifyPublicImage(imageUrl) {
  const attempts = Math.max(1, Math.min(12, Number(process.env.DEPLOY_VERIFY_ATTEMPTS || 6)));
  const interval = Math.max(1000, Math.min(10000, Number(process.env.DEPLOY_VERIFY_INTERVAL_MS || 10000)));
  let last = "no response";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(imageUrl, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10000) });
      last = `HTTP ${response.status}`;
      if (response.status === 200 && String(response.headers.get("content-type") || "").startsWith("image/")) return;
    } catch (error) {
      last = error.message;
    }
    if (attempt < attempts) await new Promise(resolveDelay => setTimeout(resolveDelay, interval));
  }
  throw new Error(`공개 이미지 URL 검증 실패 (${last}): ${imageUrl}`);
}

async function metaRequest(path, { method = "GET", body } = {}) {
  const base = (process.env.META_GRAPH_BASE_URL || "https://graph.instagram.com").replace(/\/$/, "");
  const version = process.env.META_API_VERSION;
  if (!/^v\d+\.\d+$/.test(version || "")) throw new Error("META_API_VERSION 형식이 올바르지 않습니다.");
  const url = `${base}/${version}/${path.replace(/^\//, "")}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}` },
    body: body ? new URLSearchParams(body) : undefined,
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const message = payload.error?.message || `HTTP ${response.status}`;
    throw new Error(`Meta API 실패: ${message}`);
  }
  return payload;
}

async function publishInstagram({ imageUrl, caption, altText }) {
  const igUserId = process.env.INSTAGRAM_USER_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!igUserId || !token || !process.env.META_API_VERSION) {
    return { configured: false, missing: [
      !igUserId && "INSTAGRAM_USER_ID",
      !token && "INSTAGRAM_ACCESS_TOKEN",
      !process.env.META_API_VERSION && "META_API_VERSION"
    ].filter(Boolean) };
  }

  const container = await metaRequest(`${encodeURIComponent(igUserId)}/media`, {
    method: "POST",
    body: { image_url: imageUrl, caption, alt_text: altText }
  });
  if (!container.id) throw new Error("Meta media container ID가 없습니다.");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const status = await metaRequest(`${encodeURIComponent(container.id)}?fields=status_code`);
    if (["FINISHED", "PUBLISHED"].includes(status.status_code)) break;
    if (["ERROR", "EXPIRED"].includes(status.status_code)) throw new Error(`Meta container 상태: ${status.status_code}`);
    if (attempt === 5) throw new Error(`Meta container 준비 시간 초과: ${status.status_code || "unknown"}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 5000));
  }

  const published = await metaRequest(`${encodeURIComponent(igUserId)}/media_publish`, {
    method: "POST",
    body: { creation_id: container.id }
  });
  if (!published.id) throw new Error("Instagram media ID가 없습니다.");
  return { configured: true, container_id: container.id, media_id: published.id };
}

async function continuePublishedRun(draft, state) {
  const numericId = draft.post_id.slice(2);
  const imageSrc = state.image_src || `images/p${numericId}-01.jpg`;
  let current = state;

  if (current.stage === "site_validated") {
    assertOnlyExpectedChanges(["prompts.js", imageSrc]);
    runGit(["add", "--", "prompts.js", imageSrc]);
    runGit(["commit", "-m", `Auto publish ${draft.post_id}: ${draft.title}`, "--", "prompts.js", imageSrc]);
    const commit = runGit(["rev-parse", "HEAD"]).stdout;
    current = await updateState(draft.run_id, "git_committed", {
      post_id: draft.post_id,
      image_src: imageSrc,
      git_commit: commit
    });
  }

  if (current.stage === "git_committed") {
    if (runGit(["rev-parse", "HEAD"]).stdout !== current.git_commit) {
      throw new Error("저장된 자동화 commit과 현재 HEAD가 달라 안전하게 재개할 수 없습니다.");
    }
    runGit(["push"]);
    current = await updateState(draft.run_id, "git_pushed", {
      post_id: draft.post_id,
      image_src: imageSrc,
      git_commit: current.git_commit
    });
  }

  if (current.stage === "git_pushed") {
    const imageUrl = new URL(imageSrc, inferPublicBaseUrl()).href;
    await verifyPublicImage(imageUrl);
    current = await updateState(draft.run_id, "deployment_verified", {
      post_id: draft.post_id,
      image_src: imageSrc,
      git_commit: current.git_commit,
      public_image_url: imageUrl
    });
  }

  if (["deployment_verified", "awaiting_meta_credentials"].includes(current.stage)) {
    const instagram = await publishInstagram({
      imageUrl: current.public_image_url,
      caption: draft.caption,
      altText: draft.alt_text
    });
    if (!instagram.configured) {
      const waiting = await updateState(draft.run_id, "awaiting_meta_credentials", {
        post_id: draft.post_id,
        image_src: imageSrc,
        git_commit: current.git_commit,
        public_image_url: current.public_image_url,
        missing_meta_settings: instagram.missing
      });
      console.log(JSON.stringify({
        resumed: true,
        site_published: true,
        instagram_published: false,
        missing_meta_settings: waiting.missing_meta_settings,
        git_commit: waiting.git_commit,
        public_image_url: waiting.public_image_url
      }, null, 2));
      return;
    }
    const published = await updateState(draft.run_id, "instagram_published", {
      post_id: draft.post_id,
      image_src: imageSrc,
      git_commit: current.git_commit,
      public_image_url: current.public_image_url,
      instagram_container_id: instagram.container_id,
      instagram_media_id: instagram.media_id
    });
    try {
      await savePublishedPostMetadata({ draft, state: published });
    } catch (metadataError) {
      await appendLog(draft.run_id, "metadata_save_failed", { error: metadataError.message });
    }
    console.log(JSON.stringify({
      resumed: true,
      site_published: true,
      instagram_published: true,
      git_commit: published.git_commit,
      public_image_url: published.public_image_url,
      instagram_performance_update: published.performance_report || null,
      ...instagram
    }, null, 2));
  }
}

async function commandComplete() {
  const draftPath = resolve(option("--draft"));
  const imagePath = resolve(option("--image"));
  const reviewPath = resolve(option("--review"));
  if (!option("--draft") || !option("--image") || !option("--review")) {
    throw new Error("--draft, --image, --review가 모두 필요합니다.");
  }

  const draft = await readJson(draftPath);
  const review = await readJson(reviewPath);
  const state = await readJson(statePath);
  if (!draft || !review || !state) throw new Error("초안, 검수, 실행 상태를 읽지 못했습니다.");
  if (state.stage === "instagram_published" && state.run_id === draft.run_id) {
    await savePublishedPostMetadata({ draft, state });
    console.log(JSON.stringify({ skipped: true, reason: "already_published", instagram_media_id: state.instagram_media_id }, null, 2));
    return;
  }
  if (state.run_id !== draft.run_id) throw new Error("현재 state의 run_id와 draft.run_id가 다릅니다.");
  validateDraft(draft, state.post_id);
  const reviewResult = validateReview(review, draft.run_id);
  if (!reviewResult.passed) {
    await updateState(draft.run_id, review.attempt >= MAX_ATTEMPTS ? "failed" : "image_retry_required", {
      post_id: draft.post_id,
      review,
      review_thresholds: reviewResult.thresholds
    });
    throw new Error(review.attempt >= MAX_ATTEMPTS ? "세 번의 이미지 검수 실패" : "이미지 검수 임계값 미달: 재생성이 필요합니다.");
  }

  const metadata = await imageMetadata(imagePath);
  const ratio = metadata.width / metadata.height;
  if (Math.abs(ratio - 0.8) > 0.02) throw new Error(`이미지 비율이 4:5가 아닙니다: ${metadata.width}x${metadata.height}`);
  const dryRun = booleanValue(process.env.DRY_RUN, true);
  if (!dryRun && ["site_validated", "git_committed", "git_pushed", "deployment_verified", "awaiting_meta_credentials"].includes(state.stage)) {
    await continuePublishedRun(draft, state);
    return;
  }
  const numericId = draft.post_id.slice(2);
  const imageSrc = `images/p${numericId}-01.jpg`;
  const post = makePost(draft, imageSrc);
  const { source, PROMPTS } = await readSiteData();
  if (nextPostId(PROMPTS) !== draft.post_id) throw new Error("실행 중 다음 게시물 ID가 변경되었습니다. 새 preflight가 필요합니다.");
  if (PROMPTS.some(item => item.id === draft.post_id)) throw new Error(`ID가 이미 존재합니다: ${draft.post_id}`);
  const nextPrompts = [post, ...PROMPTS];
  validateSite(nextPrompts, post, PROMPTS.length, true);
  parsePromptsSource(replacePromptsArray(source, nextPrompts));

  const runDir = dirname(draftPath);
  if (dryRun) {
    const result = {
      run_id: draft.run_id,
      dry_run: true,
      post,
      image: { source: imagePath, ...metadata, ratio },
      review,
      validation: {
        javascript_syntax: true,
        prompts_array: true,
        unique_id: true,
        cover_matches_first_image: true,
        animal_is_dog: true,
        existing_count_preserved: true,
        site_unchanged: true,
        git_unchanged: true,
        instagram_unchanged: true
      }
    };
    await writeJson(join(runDir, "dry-run-result.json"), result);
    await updateState(draft.run_id, "dry_run_complete", { post_id: draft.post_id, dry_run: true, review, image: metadata });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (metadata.format !== "jpeg") throw new Error("실제 게시 모드에서는 Meta 호환 JPEG 이미지가 필요합니다.");
  const snapshot = gitSnapshot();
  assertCleanGit(snapshot, false);
  if (snapshot.head !== state.baseline_commit) throw new Error("preflight 이후 Git HEAD가 변경되었습니다.");

  const timestamp = localTimestamp();
  const backupDir = join(backupsDir, timestamp);
  const backupPrompts = join(backupDir, "prompts.js");
  const finalImagePath = join(projectRoot, ...imageSrc.split("/"));
  let siteWritten = false;
  let commitCreated = false;
  await mkdir(backupDir, { recursive: true });
  await copyFile(promptsPath, backupPrompts, fsConstants.COPYFILE_EXCL);
  try {
    await copyFile(imagePath, finalImagePath, fsConstants.COPYFILE_EXCL);
    await atomicWrite(promptsPath, replacePromptsArray(source, nextPrompts));
    siteWritten = true;
    const verified = await readSiteData();
    validateSite(verified.PROMPTS, post, PROMPTS.length, await exists(finalImagePath));
    assertOnlyExpectedChanges(["prompts.js", imageSrc]);
    await updateState(draft.run_id, "site_validated", { post_id: draft.post_id, image_src: imageSrc, backup_dir: backupDir });

    runGit(["add", "--", "prompts.js", imageSrc]);
    assertOnlyExpectedChanges(["prompts.js", imageSrc]);
    const commitMessage = `Auto publish ${draft.post_id}: ${draft.title}`;
    runGit(["commit", "-m", commitMessage, "--", "prompts.js", imageSrc]);
    commitCreated = true;
    const commit = runGit(["rev-parse", "HEAD"]).stdout;
    await updateState(draft.run_id, "git_committed", { post_id: draft.post_id, git_commit: commit });
    runGit(["push"]);
    await updateState(draft.run_id, "git_pushed", { post_id: draft.post_id, git_commit: commit });

    const baseUrl = inferPublicBaseUrl();
    const imageUrl = new URL(imageSrc, baseUrl).href;
    await verifyPublicImage(imageUrl);
    await updateState(draft.run_id, "deployment_verified", { post_id: draft.post_id, git_commit: commit, public_image_url: imageUrl });

    const instagram = await publishInstagram({ imageUrl, caption: draft.caption, altText: draft.alt_text });
    if (!instagram.configured) {
      await updateState(draft.run_id, "awaiting_meta_credentials", {
        post_id: draft.post_id,
        git_commit: commit,
        public_image_url: imageUrl,
        missing_meta_settings: instagram.missing
      });
      console.log(JSON.stringify({ site_published: true, instagram_published: false, missing_meta_settings: instagram.missing, git_commit: commit, public_image_url: imageUrl }, null, 2));
      return;
    }
    const published = await updateState(draft.run_id, "instagram_published", {
      post_id: draft.post_id,
      git_commit: commit,
      public_image_url: imageUrl,
      instagram_container_id: instagram.container_id,
      instagram_media_id: instagram.media_id
    });
    try {
      await savePublishedPostMetadata({ draft, state: published });
    } catch (metadataError) {
      await appendLog(draft.run_id, "metadata_save_failed", { error: metadataError.message });
    }
    console.log(JSON.stringify({
      site_published: true,
      instagram_published: true,
      git_commit: commit,
      public_image_url: imageUrl,
      instagram_performance_update: published.performance_report || null,
      ...instagram
    }, null, 2));
  } catch (error) {
    if (siteWritten && !commitCreated) {
      await copyFile(backupPrompts, promptsPath);
      await rm(finalImagePath, { force: true });
      await updateState(draft.run_id, "failed", { post_id: draft.post_id, reason: error.message, rolled_back: true });
    } else {
      await updateState(draft.run_id, "failed", { post_id: draft.post_id, reason: error.message, rolled_back: false });
    }
    throw error;
  }
}

async function commandFail() {
  const runId = option("--run-id");
  const reason = option("--reason");
  if (!runId || !reason) throw new Error("--run-id와 --reason이 필요합니다.");
  const state = await readJson(statePath, {});
  if (state.run_id && state.run_id !== runId) throw new Error("현재 state와 run ID가 다릅니다.");
  await updateState(runId, "failed", { post_id: state.post_id || null, reason });
  console.log(JSON.stringify({ run_id: runId, stage: "failed", reason }, null, 2));
}

async function commandInsights() {
  const result = await updateInstagramInsights();
  await appendLog("insights-update", "insights_updated", {
    auth_status: result.auth_status,
    checked_posts: result.checked_posts,
    new_snapshots: result.new_snapshots,
    supported_metrics: result.supported_metrics || []
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.auth_status === "permission_missing") process.exitCode = 1;
}

async function commandTest() {
  const { PROMPTS, source } = await readSiteData();
  const summary = summarizeSite(PROMPTS);
  const failures = [];
  if (!PROMPTS.length) failures.push("PROMPTS가 비어 있음");
  if (summary.duplicate_ids.length) failures.push(`중복 ID: ${summary.duplicate_ids.join(", ")}`);
  if (!/^P-\d{3,}$/.test(summary.next_id)) failures.push("다음 ID 형식 오류");
  if (!(await exists(referencePath))) failures.push("콩이 기준 이미지 없음");
  try { parsePromptsSource(source); } catch (error) { failures.push(`JavaScript 파싱 실패: ${error.message}`); }
  for (const item of PROMPTS) {
    if (!item.id || !item.title || !item.category) failures.push(`${item.id || "unknown"}: 필수 데이터 누락`);
    const cover = item.cover || item.image;
    if (cover && !(await exists(join(projectRoot, ...cover.split("/"))))) failures.push(`${item.id}: 이미지 없음 ${cover}`);
  }
  const passingReview = validateReview({ run_id: "test", attempt: 1, identity_score: 75, visual_quality_score: 80, concept_score: 80, fatal_issue: false, notes: "threshold" }, "test");
  if (!passingReview.passed) failures.push("검수 임계값 경계 테스트 실패");
  const failingReview = validateReview({ run_id: "test", attempt: 1, identity_score: 74, visual_quality_score: 100, concept_score: 100, fatal_issue: false, notes: "threshold" }, "test");
  if (failingReview.passed) failures.push("검수 실패 임계값 테스트 실패");
  const rates = deriveRates({
    reach: { status: "ok", value: 100 }, likes: { status: "ok", value: 10 },
    comments: { status: "ok", value: 2 }, saved: { status: "ok", value: 5 },
    shares: { status: "ok", value: 3 }, total_interactions: { status: "ok", value: 20 }
  });
  if (rates.save_rate !== 0.05 || rates.share_rate !== 0.03 || rates.interaction_rate !== 0.2) failures.push("Insights 비율 계산 테스트 실패");
  if (deriveRates({ reach: { status: "ok", value: 0 }, likes: { status: "ok", value: 1 } }).like_rate !== null) failures.push("Insights 0 reach 보호 테스트 실패");
  if (samplePolicy(1).planning_use || samplePolicy(5).level !== "weak_signal" || samplePolicy(20).level !== "stronger") failures.push("Insights 소표본 정책 테스트 실패");
  const initialPlan = collectionPlan({ published_at: new Date(Date.now() - 1_800_000).toISOString(), insights: { snapshots: [] } });
  if (initialPlan?.snapshot_type !== "initial" || initialPlan?.checkpoint) failures.push("Insights initial checkpoint 테스트 실패");
  const checkpointPlan = collectionPlan({ published_at: new Date(Date.now() - 30 * 3_600_000).toISOString(), insights: { snapshots: [] } });
  if (checkpointPlan?.checkpoint !== "24h") failures.push("Insights 24h checkpoint 테스트 실패");
  const fixedNow = new Date("2026-08-25T12:00:00.000Z");
  const publishedAt = new Date(fixedNow.getTime() - 80 * 3_600_000).toISOString();
  const snapshot24h = { collected_at: new Date(fixedNow.getTime() - 50 * 3_600_000).toISOString(), checkpoint: "24h" };
  if (collectionPlan({ published_at: publishedAt, insights: { snapshots: [snapshot24h] } }, fixedNow)?.checkpoint !== "72h") failures.push("Insights 72h checkpoint 테스트 실패");
  const oldPublishedAt = new Date(fixedNow.getTime() - 200 * 3_600_000).toISOString();
  const snapshot72h = { collected_at: new Date(fixedNow.getTime() - 100 * 3_600_000).toISOString(), checkpoint: "72h" };
  if (collectionPlan({ published_at: oldPublishedAt, insights: { snapshots: [snapshot24h, snapshot72h] } }, fixedNow)?.checkpoint !== "7d") failures.push("Insights 7d checkpoint 테스트 실패");
  const recentLatest = { collected_at: new Date(fixedNow.getTime() - 2 * 3_600_000).toISOString(), checkpoint: null };
  if (collectionPlan({ published_at: publishedAt, insights: { snapshots: [snapshot24h, snapshot72h, recentLatest] } }, fixedNow) !== null) failures.push("Insights 12시간 중복 방지 테스트 실패");
  const result = { passed: failures.length === 0, failures, site: summary };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
}

async function main() {
  await loadEnv();
  const command = process.argv[2] || "inspect";
  if (command === "inspect") return commandInspect();
  if (command === "preflight") return commandPreflight();
  if (command === "complete") return commandComplete();
  if (command === "insights") return commandInsights();
  if (command === "fail") return commandFail();
  if (command === "test") return commandTest();
  throw new Error(`알 수 없는 명령: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}

export {
  imageMetadata,
  nextPostId,
  parsePromptsSource,
  summarizeSite,
  commandInsights,
  validateDraft,
  validateReview
};
