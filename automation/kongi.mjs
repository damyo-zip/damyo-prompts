import { constants as fsConstants } from "node:fs";
import {
  access,
  appendFile,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import kongiAccount from "./accounts/kongi.mjs";
import hamnimiAccount from "./accounts/hamnimi.mjs";
import {
  collectionPlan,
  deriveRates,
  samplePolicy,
  savePublishedPostMetadata,
  updateInstagramInsights
} from "./insights.mjs";
import { getBestTrendForAccount } from "./trend-radar/index.mjs";

const automationDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(automationDir);
const promptsPath = join(projectRoot, "prompts.js");
let accountConfig = kongiAccount;
let referencePath;
let statePath;
let runsDir;
let logsDir;
let backupsDir;
let postsDir;
let insightsSummaryPath;
const MAX_ATTEMPTS = 3;

function configureAccount(config) {
  accountConfig = config;
  referencePath = join(automationDir, "reference", config.referenceFile);
  statePath = join(automationDir, "state", `${config.accountKey}.json`);
  runsDir = join(automationDir, "runs", config.accountKey);
  logsDir = join(automationDir, "logs", config.accountKey);
  backupsDir = join(automationDir, "backups", config.accountKey);
  postsDir = join(automationDir, "posts", config.accountKey);
  insightsSummaryPath = join(automationDir, "insights-summary", `${config.accountKey}.json`);
}

configureAccount(kongiAccount);

function instagramCtaRelativePath() {
  const value = String(accountConfig.instagramCtaImage || "").trim().replace(/\\/g, "/");
  if (!value || value.startsWith("/") || /^[A-Za-z]:/.test(value) || /(^|\/)\.\.(\/|$)/.test(value)) {
    throw new Error(`${accountConfig.displayName} Instagram CTA 이미지 경로 설정이 올바르지 않습니다.`);
  }
  return value;
}

function instagramCtaPath() {
  return join(projectRoot, ...instagramCtaRelativePath().split("/"));
}

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

function accountCredentials() {
  const settings = accountConfig.instagram;
  return {
    userId: process.env[settings.userIdEnv] || (settings.legacyUserIdEnv ? process.env[settings.legacyUserIdEnv] : "") || "",
    accessToken: process.env[settings.accessTokenEnv] || (settings.legacyAccessTokenEnv ? process.env[settings.legacyAccessTokenEnv] : "") || "",
    userIdEnv: settings.userIdEnv,
    accessTokenEnv: settings.accessTokenEnv,
    usingLegacyFallback: Boolean(
      settings.legacyAccessTokenEnv &&
      !process.env[settings.accessTokenEnv] &&
      process.env[settings.legacyAccessTokenEnv]
    )
  };
}

function insightsContext() {
  const credentials = accountCredentials();
  return {
    accountKey: accountConfig.accountKey,
    displayName: accountConfig.displayName,
    postsDir,
    statePath,
    summaryPath: insightsSummaryPath,
    accessToken: credentials.accessToken,
    accessTokenEnv: credentials.accessTokenEnv
  };
}

async function migrateLegacyKongiRuntime() {
  if (accountConfig.accountKey !== "kongi") return;
  const legacyStatePath = join(automationDir, "state.json");
  const legacyPostsDir = join(automationDir, "posts");
  const legacySummaryPath = join(automationDir, "insights-summary.json");
  if (!(await exists(statePath)) && await exists(legacyStatePath)) {
    await mkdir(dirname(statePath), { recursive: true });
    await copyFile(legacyStatePath, statePath, fsConstants.COPYFILE_EXCL);
  }
  const migratedState = await readJson(statePath, null);
  if (migratedState && !migratedState.account_key) {
    await writeJson(statePath, { ...migratedState, account_key: "kongi" });
  }
  await mkdir(postsDir, { recursive: true });
  if (await exists(legacyPostsDir)) {
    for (const entry of await readdir(legacyPostsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const destination = join(postsDir, entry.name);
      if (!(await exists(destination))) await copyFile(join(legacyPostsDir, entry.name), destination, fsConstants.COPYFILE_EXCL);
    }
  }
  if (!(await exists(insightsSummaryPath)) && await exists(legacySummaryPath)) {
    await mkdir(dirname(insightsSummaryPath), { recursive: true });
    await copyFile(legacySummaryPath, insightsSummaryPath, fsConstants.COPYFILE_EXCL);
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

function summarizeSite(prompts, animal = accountConfig.animal) {
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
    account_posts: prompts.filter(item => getAnimal(item) === animal).map(item => ({
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
  const entry = { timestamp: new Date().toISOString(), account_key: accountConfig.accountKey, run_id: runId, stage, ...details };
  await appendFile(join(logsDir, `${day}.jsonl`), `${JSON.stringify(entry)}\n`, "utf8");
}

async function updateState(runId, stage, details = {}) {
  const previous = await readJson(statePath, {});
  const next = {
    ...previous,
    ...details,
    account_key: accountConfig.accountKey,
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
  const ctaPath = instagramCtaPath();
  console.log(JSON.stringify({
    account: accountConfig,
    project_root: projectRoot,
    reference_image: referencePath,
    reference_exists: await exists(referencePath),
    instagram_cta_image: ctaPath,
    instagram_cta_exists: await exists(ctaPath),
    git: gitSnapshot(),
    site: summarizeSite(PROMPTS)
  }, null, 2));
}

async function commandPreflight() {
  const allowDevelopmentDirty = hasFlag("--development-dirty") && booleanValue(process.env.DRY_RUN, true);
  const cta = await validateInstagramCtaImage();
  const ctaImageUrl = publicAssetUrl(cta.relative_path);
  await verifyPublicImage(ctaImageUrl);
  let performanceUpdate;
  try {
    performanceUpdate = await updateInstagramInsights({ context: insightsContext() });
  } catch (error) {
    if (error.kind === "auth_invalid") throw error;
    performanceUpdate = { auth_status: "temporary_failure", error: error.message };
    await appendLog("insights-update", "insights_failed", { error: error.message });
  }

  const snapshot = gitSnapshot();
  assertCleanGit(snapshot, allowDevelopmentDirty);
  if (!(await exists(referencePath))) throw new Error(`${accountConfig.displayName} 기준 이미지가 없습니다: ${referencePath}`);

  const { PROMPTS } = await readSiteData();
  const site = summarizeSite(PROMPTS);
  if (site.duplicate_ids.length) throw new Error(`중복 ID가 있습니다: ${site.duplicate_ids.join(", ")}`);

  const trendRecommendation = await getBestTrendForAccount(accountConfig.accountKey);

  const previous = await readJson(statePath, null);
  const runId = activeState(previous) ? previous.run_id : `${accountConfig.accountKey}-${localTimestamp()}-${randomSuffix()}`;
  const postId = activeState(previous) ? previous.post_id : site.next_id;
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });
  const payload = {
    run_id: runId,
    account_key: accountConfig.accountKey,
    display_name: accountConfig.displayName,
    animal: accountConfig.animal,
    post_id: postId,
    run_dir: runDir,
    dry_run: booleanValue(process.env.DRY_RUN, true),
    baseline_commit: activeState(previous) ? previous.baseline_commit : snapshot.head,
    existing_count: site.count,
    existing_account_posts: site.account_posts,
    idea_guidance: accountConfig.ideaGuidance,
    trend_radar: trendRecommendation,
    identity_guidance: accountConfig.identityGuidance,
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
    instagram_cta_image: cta,
    public_cta_image_url: ctaImageUrl,
    git: snapshot
  };
  await writeJson(join(runDir, "preflight.json"), payload);
  await updateState(runId, "preflight_complete", {
    account_key: accountConfig.accountKey,
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
  if (draft.account_key && draft.account_key !== accountConfig.accountKey) {
    throw new Error(`draft.account_key(${draft.account_key})가 현재 계정(${accountConfig.accountKey})과 다릅니다.`);
  }
  if (draft.prompt.includes(accountConfig.displayName)) {
    throw new Error(`공유용 prompt에는 특정 이름 '${accountConfig.displayName}'를 넣을 수 없습니다.`);
  }
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
  if (review.account_key && review.account_key !== accountConfig.accountKey) throw new Error("review.account_key가 현재 계정과 다릅니다.");
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

async function validateInstagramCtaImage() {
  const relativePath = instagramCtaRelativePath();
  const absolutePath = instagramCtaPath();
  if (!(await exists(absolutePath))) {
    throw new Error(`${accountConfig.displayName} Instagram CTA 이미지가 없어 게시를 중단함`);
  }
  let metadata;
  try {
    metadata = await imageMetadata(absolutePath);
  } catch (error) {
    throw new Error(`${accountConfig.displayName} Instagram CTA 이미지를 정상적으로 읽을 수 없어 게시를 중단함: ${error.message}`);
  }
  if (metadata.format !== "jpeg" || metadata.width !== 1080 || metadata.height !== 1350 || metadata.width / metadata.height !== 0.8) {
    throw new Error(`${accountConfig.displayName} Instagram CTA 이미지 규격이 1080x1350 JPEG(4:5)가 아니어서 게시를 중단함: ${metadata.width}x${metadata.height} ${metadata.format}`);
  }
  return { relative_path: relativePath, absolute_path: absolutePath, ...metadata, ratio: 0.8 };
}

function makePost(draft, imageSrc) {
  return {
    id: draft.post_id,
    animal: accountConfig.animal,
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
  if (post.animal !== accountConfig.animal) throw new Error(`animal은 ${accountConfig.animal}이어야 합니다.`);
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

function publicAssetUrl(relativePath, baseUrl = inferPublicBaseUrl()) {
  return new URL(relativePath.replace(/\\/g, "/"), baseUrl).href;
}

function buildInstagramCarouselPlan({ contentImageUrls, ctaImageUrl, caption, altText }) {
  if (!Array.isArray(contentImageUrls) || contentImageUrls.length < 1) {
    throw new Error("Instagram Carousel에는 콘텐츠 이미지가 한 장 이상 필요합니다.");
  }
  if (contentImageUrls.length > 9) {
    throw new Error("CTA를 포함한 Instagram Carousel은 콘텐츠 이미지를 최대 9장까지 지원합니다.");
  }
  for (const [index, url] of [...contentImageUrls, ctaImageUrl].entries()) {
    if (!/^https?:\/\//i.test(String(url || ""))) throw new Error(`Instagram Carousel ${index + 1}번 이미지의 공개 URL이 올바르지 않습니다.`);
  }
  const slides = [
    ...contentImageUrls.map((imageUrl, index) => ({
      role: "content",
      label: `content_${index + 1}`,
      image_url: imageUrl,
      alt_text: contentImageUrls.length === 1 ? altText : `${altText} (${index + 1}/${contentImageUrls.length})`
    })),
    {
      role: "cta",
      label: `cta_${accountConfig.accountKey}`,
      account_key: accountConfig.accountKey,
      image_url: ctaImageUrl,
      alt_text: `${accountConfig.displayName} Instagram 프로필 방문 안내 이미지`
    }
  ];
  return {
    account_key: accountConfig.accountKey,
    child_order: slides.map(slide => slide.label),
    final_slide: slides.at(-1).label,
    child_container_requests: slides.map(slide => ({
      method: "POST",
      endpoint: "/{ig_user_id}/media",
      role: slide.role,
      body: { image_url: slide.image_url, is_carousel_item: "true", alt_text: slide.alt_text }
    })),
    carousel_container_request: {
      method: "POST",
      endpoint: "/{ig_user_id}/media",
      body: {
        media_type: "CAROUSEL",
        children: slides.map((_, index) => `{{child_${index + 1}_container_id}}`).join(","),
        caption
      }
    },
    publish_request: {
      method: "POST",
      endpoint: "/{ig_user_id}/media_publish",
      body: { creation_id: "{{carousel_container_id}}" }
    }
  };
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

async function metaRequest(path, { method = "GET", body, accessToken = accountCredentials().accessToken } = {}) {
  const base = (process.env.META_GRAPH_BASE_URL || "https://graph.instagram.com").replace(/\/$/, "");
  const version = process.env.META_API_VERSION;
  if (!/^v\d+\.\d+$/.test(version || "")) throw new Error("META_API_VERSION 형식이 올바르지 않습니다.");
  const url = `${base}/${version}/${path.replace(/^\//, "")}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
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

async function waitForMetaContainer(containerId, accessToken) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const status = await metaRequest(`${encodeURIComponent(containerId)}?fields=status_code`, { accessToken });
    if (["FINISHED", "PUBLISHED"].includes(status.status_code)) return status.status_code;
    if (["ERROR", "EXPIRED"].includes(status.status_code)) throw new Error(`Meta container 상태: ${status.status_code}`);
    if (attempt === 5) throw new Error(`Meta container 준비 시간 초과: ${status.status_code || "unknown"}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 5000));
  }
  throw new Error("Meta container 준비 상태를 확인하지 못했습니다.");
}

async function publishInstagramCarousel({
  contentImageUrls,
  ctaImageUrl,
  caption,
  altText,
  existingContainerId = null,
  existingChildContainerIds = [],
  onContainerCreated = null
}) {
  const credentials = accountCredentials();
  const igUserId = credentials.userId;
  const token = credentials.accessToken;
  if (!igUserId || !token || !process.env.META_API_VERSION) {
    return { configured: false, missing: [
      !igUserId && credentials.userIdEnv,
      !token && credentials.accessTokenEnv,
      !process.env.META_API_VERSION && "META_API_VERSION"
    ].filter(Boolean) };
  }

  const plan = buildInstagramCarouselPlan({ contentImageUrls, ctaImageUrl, caption, altText });
  let childContainerIds = [...existingChildContainerIds];
  let containerId = existingContainerId;
  if (!containerId) {
    childContainerIds = [];
    for (const request of plan.child_container_requests) {
      const child = await metaRequest(`${encodeURIComponent(igUserId)}/media`, {
        method: "POST",
        body: request.body,
        accessToken: token
      });
      if (!child.id) throw new Error(`Meta ${request.role} child container ID가 없습니다.`);
      await waitForMetaContainer(child.id, token);
      childContainerIds.push(child.id);
    }

    const container = await metaRequest(`${encodeURIComponent(igUserId)}/media`, {
      method: "POST",
      body: { media_type: "CAROUSEL", children: childContainerIds.join(","), caption },
      accessToken: token
    });
    if (!container.id) throw new Error("Meta Carousel container ID가 없습니다.");
    containerId = container.id;
    if (onContainerCreated) await onContainerCreated({
      child_container_ids: childContainerIds,
      container_id: containerId,
      child_order: plan.child_order
    });
  }

  const parentStatus = await waitForMetaContainer(containerId, token);
  if (parentStatus === "PUBLISHED") {
    throw new Error("저장된 Meta Carousel container가 이미 PUBLISHED 상태이므로 중복 게시를 막기 위해 media_publish를 중단함");
  }

  const published = await metaRequest(`${encodeURIComponent(igUserId)}/media_publish`, {
    method: "POST",
    body: { creation_id: containerId },
    accessToken: token
  });
  if (!published.id) throw new Error("Instagram media ID가 없습니다.");
  return {
    configured: true,
    child_container_ids: childContainerIds,
    container_id: containerId,
    media_id: published.id,
    child_order: plan.child_order
  };
}

async function continuePublishedRun(draft, state) {
  const numericId = draft.post_id.slice(2);
  const imageSrc = state.image_src || `images/p${numericId}-01.jpg`;
  const cta = await validateInstagramCtaImage();
  const ctaImageUrl = publicAssetUrl(cta.relative_path);
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
    const imageUrl = publicAssetUrl(imageSrc);
    await verifyPublicImage(imageUrl);
    await verifyPublicImage(ctaImageUrl);
    current = await updateState(draft.run_id, "deployment_verified", {
      post_id: draft.post_id,
      image_src: imageSrc,
      git_commit: current.git_commit,
      public_image_url: imageUrl,
      public_content_image_urls: [imageUrl],
      public_cta_image_url: ctaImageUrl,
      instagram_cta_path: cta.relative_path
    });
  }

  if (["deployment_verified", "awaiting_meta_credentials"].includes(current.stage)) {
    const contentImageUrls = current.public_content_image_urls || [current.public_image_url];
    const currentCtaImageUrl = current.public_cta_image_url || ctaImageUrl;
    if (!current.public_cta_image_url) {
      await verifyPublicImage(currentCtaImageUrl);
      current = await updateState(draft.run_id, current.stage, {
        public_content_image_urls: contentImageUrls,
        public_cta_image_url: currentCtaImageUrl,
        instagram_cta_path: cta.relative_path
      });
    }
    const instagram = await publishInstagramCarousel({
      contentImageUrls,
      ctaImageUrl: currentCtaImageUrl,
      caption: draft.caption,
      altText: draft.alt_text,
      existingContainerId: current.instagram_carousel_container_id || null,
      existingChildContainerIds: current.instagram_child_container_ids || [],
      onContainerCreated: async containers => {
        current = await updateState(draft.run_id, current.stage, {
          instagram_child_container_ids: containers.child_container_ids,
          instagram_carousel_container_id: containers.container_id,
          instagram_child_order: containers.child_order
        });
      }
    });
    if (!instagram.configured) {
      const waiting = await updateState(draft.run_id, "awaiting_meta_credentials", {
        post_id: draft.post_id,
        image_src: imageSrc,
        git_commit: current.git_commit,
        public_image_url: current.public_image_url,
        public_content_image_urls: contentImageUrls,
        public_cta_image_url: currentCtaImageUrl,
        instagram_cta_path: cta.relative_path,
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
      public_content_image_urls: contentImageUrls,
      public_cta_image_url: currentCtaImageUrl,
      instagram_cta_path: cta.relative_path,
      instagram_child_container_ids: instagram.child_container_ids,
      instagram_child_order: instagram.child_order,
      instagram_carousel_container_id: instagram.container_id,
      instagram_container_id: instagram.container_id,
      instagram_media_id: instagram.media_id
    });
    try {
      await savePublishedPostMetadata({ draft, state: published, context: insightsContext() });
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
  if (state.account_key && state.account_key !== accountConfig.accountKey) throw new Error("현재 state가 다른 계정에 속합니다.");
  if (state.stage === "instagram_published" && state.run_id === draft.run_id) {
    await savePublishedPostMetadata({ draft, state, context: insightsContext() });
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

  const cta = await validateInstagramCtaImage();
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
  const publicContentImageUrl = publicAssetUrl(imageSrc);
  const publicCtaImageUrl = publicAssetUrl(cta.relative_path);
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
      instagram_carousel: buildInstagramCarouselPlan({
        contentImageUrls: [publicContentImageUrl],
        ctaImageUrl: publicCtaImageUrl,
        caption: draft.caption,
        altText: draft.alt_text
      }),
      instagram_cta_image: cta,
      review,
      validation: {
        javascript_syntax: true,
        prompts_array: true,
        unique_id: true,
        cover_matches_first_image: true,
        animal_matches_account: true,
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
    const imageUrl = publicAssetUrl(imageSrc, baseUrl);
    const ctaImageUrl = publicAssetUrl(cta.relative_path, baseUrl);
    await verifyPublicImage(imageUrl);
    await verifyPublicImage(ctaImageUrl);
    await updateState(draft.run_id, "deployment_verified", {
      post_id: draft.post_id,
      git_commit: commit,
      public_image_url: imageUrl,
      public_content_image_urls: [imageUrl],
      public_cta_image_url: ctaImageUrl,
      instagram_cta_path: cta.relative_path
    });

    const instagram = await publishInstagramCarousel({
      contentImageUrls: [imageUrl],
      ctaImageUrl,
      caption: draft.caption,
      altText: draft.alt_text,
      onContainerCreated: async containers => updateState(draft.run_id, "deployment_verified", {
        post_id: draft.post_id,
        git_commit: commit,
        public_image_url: imageUrl,
        public_content_image_urls: [imageUrl],
        public_cta_image_url: ctaImageUrl,
        instagram_cta_path: cta.relative_path,
        instagram_child_container_ids: containers.child_container_ids,
        instagram_carousel_container_id: containers.container_id,
        instagram_child_order: containers.child_order
      })
    });
    if (!instagram.configured) {
      await updateState(draft.run_id, "awaiting_meta_credentials", {
        post_id: draft.post_id,
        git_commit: commit,
        public_image_url: imageUrl,
        public_content_image_urls: [imageUrl],
        public_cta_image_url: ctaImageUrl,
        instagram_cta_path: cta.relative_path,
        missing_meta_settings: instagram.missing
      });
      console.log(JSON.stringify({ site_published: true, instagram_published: false, missing_meta_settings: instagram.missing, git_commit: commit, public_image_url: imageUrl }, null, 2));
      return;
    }
    const published = await updateState(draft.run_id, "instagram_published", {
      post_id: draft.post_id,
      git_commit: commit,
      public_image_url: imageUrl,
      public_content_image_urls: [imageUrl],
      public_cta_image_url: ctaImageUrl,
      instagram_cta_path: cta.relative_path,
      instagram_child_container_ids: instagram.child_container_ids,
      instagram_child_order: instagram.child_order,
      instagram_carousel_container_id: instagram.container_id,
      instagram_container_id: instagram.container_id,
      instagram_media_id: instagram.media_id
    });
    try {
      await savePublishedPostMetadata({ draft, state: published, context: insightsContext() });
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
    } else if (commitCreated) {
      await appendLog(draft.run_id, "recoverable_failure", { reason: error.message, rolled_back: false });
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

async function commandInsights({ silent = false } = {}) {
  const result = await updateInstagramInsights({ context: insightsContext() });
  await appendLog("insights-update", "insights_updated", {
    auth_status: result.auth_status,
    examined_posts: result.examined_posts || 0,
    checked_posts: result.checked_posts,
    api_called_posts: result.api_called_posts || 0,
    new_snapshots: result.new_snapshots,
    supported_metrics: result.supported_metrics || []
  });
  if (!silent) console.log(JSON.stringify(result, null, 2));
  if (result.auth_status === "permission_missing") process.exitCode = 1;
  return result;
}

async function runInsightsForAccount(config, options = {}) {
  configureAccount(config);
  await loadEnv();
  await migrateLegacyKongiRuntime();
  return commandInsights(options);
}

async function commandCtaCheck() {
  const cta = await validateInstagramCtaImage();
  const contentImageUrl = option("--content-url") || publicAssetUrl("images/dry-run-content.jpg");
  const ctaImageUrl = publicAssetUrl(cta.relative_path);
  const plan = buildInstagramCarouselPlan({
    contentImageUrls: [contentImageUrl],
    ctaImageUrl,
    caption: option("--caption", "DRY RUN caption"),
    altText: option("--alt-text", "DRY RUN content image")
  });
  console.log(JSON.stringify({
    dry_run: true,
    meta_requests_sent: false,
    content_image_urls: [contentImageUrl],
    cta_image_url: ctaImageUrl,
    cta_image: cta,
    ...plan
  }, null, 2));
}

async function commandTest() {
  const { PROMPTS, source } = await readSiteData();
  const summary = summarizeSite(PROMPTS, accountConfig.animal);
  const failures = [];
  if (!PROMPTS.length) failures.push("PROMPTS가 비어 있음");
  if (summary.duplicate_ids.length) failures.push(`중복 ID: ${summary.duplicate_ids.join(", ")}`);
  if (!/^P-\d{3,}$/.test(summary.next_id)) failures.push("다음 ID 형식 오류");
  if (!(await exists(referencePath))) failures.push(`${accountConfig.displayName} 기준 이미지 없음`);
  try { parsePromptsSource(source); } catch (error) { failures.push(`JavaScript 파싱 실패: ${error.message}`); }
  for (const item of PROMPTS) {
    if (!item.id || !item.title || !item.category) failures.push(`${item.id || "unknown"}: 필수 데이터 누락`);
    const cover = item.cover || item.image;
    if (cover && !(await exists(join(projectRoot, ...cover.split("/"))))) failures.push(`${item.id}: 이미지 없음 ${cover}`);
    const siteImages = [cover, ...(item.images || []).map(image => image?.src)].filter(Boolean);
    if (siteImages.includes(instagramCtaRelativePath())) failures.push(`${item.id}: 사이트 게시물에 Instagram CTA가 포함됨`);
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
  const syntheticPost = makePost({ post_id: "P-999", title: "test", category: "test", description: "test", prompt: "test" }, "images/test.jpg");
  if (syntheticPost.animal !== accountConfig.animal) failures.push("계정 animal mapping 테스트 실패");
  const ctaRelativePath = instagramCtaRelativePath();
  const otherAccount = accountConfig.accountKey === "kongi" ? hamnimiAccount : kongiAccount;
  if (ctaRelativePath === otherAccount.instagramCtaImage) failures.push("계정별 CTA 경로 분리 테스트 실패");
  const carouselDryRun = buildInstagramCarouselPlan({
    contentImageUrls: ["https://example.test/content-1.jpg", "https://example.test/content-2.jpg"],
    ctaImageUrl: publicAssetUrl(ctaRelativePath),
    caption: "DRY RUN caption",
    altText: "DRY RUN content"
  });
  if (carouselDryRun.child_order.join(",") !== `content_1,content_2,cta_${accountConfig.accountKey}`) failures.push("Carousel 콘텐츠→CTA 순서 테스트 실패");
  if (carouselDryRun.final_slide !== `cta_${accountConfig.accountKey}`) failures.push("Carousel 최종 CTA 계정 mapping 테스트 실패");
  if (carouselDryRun.child_container_requests.some(request => request.body.is_carousel_item !== "true")) failures.push("Carousel child is_carousel_item 테스트 실패");
  if (carouselDryRun.child_container_requests.some(request => Object.hasOwn(request.body, "caption"))) failures.push("Carousel caption child 분리 테스트 실패");
  if (carouselDryRun.carousel_container_request.body.media_type !== "CAROUSEL") failures.push("Carousel parent payload 테스트 실패");
  if (carouselDryRun.carousel_container_request.body.caption !== "DRY RUN caption") failures.push("Carousel parent caption 테스트 실패");
  if (carouselDryRun.child_container_requests.at(-1).body.image_url !== publicAssetUrl(ctaRelativePath)) failures.push("Carousel 최종 CTA URL 테스트 실패");
  if (syntheticPost.images.some(image => image.src === ctaRelativePath)) failures.push("사이트 CTA 분리 테스트 실패");
  const maximumCarousel = buildInstagramCarouselPlan({
    contentImageUrls: Array.from({ length: 9 }, (_, index) => `https://example.test/content-${index + 1}.jpg`),
    ctaImageUrl: publicAssetUrl(ctaRelativePath),
    caption: "maximum",
    altText: "maximum"
  });
  if (maximumCarousel.child_container_requests.length !== 10 || maximumCarousel.final_slide !== `cta_${accountConfig.accountKey}`) failures.push("Carousel 9개 콘텐츠+CTA 상한 테스트 실패");
  try {
    buildInstagramCarouselPlan({
      contentImageUrls: Array.from({ length: 10 }, (_, index) => `https://example.test/content-${index + 1}.jpg`),
      ctaImageUrl: publicAssetUrl(ctaRelativePath),
      caption: "overflow",
      altText: "overflow"
    });
    failures.push("Carousel 10개 콘텐츠 상한 차단 테스트 실패");
  } catch (error) {
    if (!error.message.includes("최대 9장")) failures.push("Carousel 상한 오류 메시지 테스트 실패");
  }
  const credentials = accountCredentials();
  if (accountConfig.accountKey === "kongi" && process.env.INSTAGRAM_ACCESS_TOKEN && !credentials.accessToken) failures.push("콩이 legacy credential fallback 테스트 실패");
  if (accountConfig.accountKey === "kongi") {
    const p040 = await readJson(join(postsDir, "p-040.json"), null);
    if (!p040 || p040.post_id !== "P-040" || p040.instagram_media_id !== "18094000493454257") failures.push("P-040 metadata migration 테스트 실패");
  }
  const result = {
    passed: failures.length === 0,
    failures,
    account: {
      account_key: accountConfig.accountKey,
      display_name: accountConfig.displayName,
      animal: accountConfig.animal,
      reference_exists: await exists(referencePath),
      instagram_cta_path: ctaRelativePath,
      instagram_cta_exists: await exists(instagramCtaPath()),
      credentials_configured: Boolean(credentials.userId && credentials.accessToken),
      using_legacy_credential_fallback: credentials.usingLegacyFallback
    },
    site: summary,
    carousel_dry_run: {
      meta_requests_sent: false,
      content_image_urls: carouselDryRun.child_container_requests.filter(request => request.role === "content").map(request => request.body.image_url),
      cta_image_url: carouselDryRun.child_container_requests.at(-1).body.image_url,
      child_order: carouselDryRun.child_order,
      final_slide: carouselDryRun.final_slide,
      child_payloads: carouselDryRun.child_container_requests.map(request => request.body),
      carousel_payload: carouselDryRun.carousel_container_request.body,
      publish_payload: carouselDryRun.publish_request.body
    }
  };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
}

async function runForAccount(config, command = "inspect") {
  configureAccount(config);
  await loadEnv();
  await migrateLegacyKongiRuntime();
  if (command === "inspect") return commandInspect();
  if (command === "preflight") return commandPreflight();
  if (command === "complete") return commandComplete();
  if (command === "insights") return commandInsights();
  if (command === "cta-check") return commandCtaCheck();
  if (command === "fail") return commandFail();
  if (command === "test") return commandTest();
  throw new Error(`알 수 없는 명령: ${command}`);
}

async function main() {
  return runForAccount(kongiAccount, process.argv[2] || "inspect");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}

export {
  buildInstagramCarouselPlan,
  imageMetadata,
  nextPostId,
  parsePromptsSource,
  runForAccount,
  runInsightsForAccount,
  summarizeSite,
  commandInsights,
  validateDraft,
  validateReview
};
