import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildGenerationPlan,
  experienceConfigFromEnv,
  validateReviewPackage
} from "./content-experience.mjs";
import { selectIdeaSource } from "./idea-selector.mjs";
import { savePublishedPostMetadata } from "./insights.mjs";
import { buildInstagramCarouselPlan } from "./kongi.mjs";
import { adaptConcept } from "./trend-radar/account-adapter.mjs";
import { applyAccountPerformance, executeShadowAccounts } from "./trend-radar/runner.mjs";
import { loadPerformanceScores } from "./trend-radar/storage.mjs";

function config(overrides = {}) {
  return {
    enabled: true,
    accounts: ["kongi", "hamnimi"],
    minEvidence: 50,
    allowDeclining: false,
    duplicateThreshold: 0.72,
    ownerRequiredEnabled: true,
    carouselIdeasEnabled: true,
    ownerOptionalPolicy: "omit",
    ...overrides
  };
}

function concept(overrides = {}) {
  return {
    concept_id: "ham-trend-1",
    concept_key: "miniature-world",
    title: "Miniature Hamster Workplace",
    description: "작은 햄스터가 미니 작업실에서 일하는 장면",
    original_trend: "Miniature worlds and dramatic scale contrast",
    pet_adaptation: "작은 반려동물의 미니 작업실",
    dog_adaptation: "강아지가 작은 작업실에서 일하는 장면",
    hamster_adaptation: "햄스터가 더 작은 작업실에서 일하며 이중 스케일 대비를 만드는 장면",
    account_fit: 100,
    total_score: 95,
    evidence_strength: 80,
    trend_momentum: "rising",
    publishable: true,
    owner_mode: "none",
    owner_requirement_reason: "",
    post_format: "single",
    carousel_fit_score: 0,
    preferred_slide_count: 1,
    carousel_reason: "",
    keywords: ["miniature", "hamster", "workplace"],
    ...overrides
  };
}

async function select(overrides = {}) {
  return selectIdeaSource({
    accountName: "hamnimi",
    config: config(),
    ownerAssetAvailable: true,
    trendProvider: async () => ({ concepts: [concept()] }),
    ...overrides
  });
}

function carouselDraft(ownerMode = "none") {
  return {
    run_id: "ham-run",
    account_key: "hamnimi",
    owner_mode: ownerMode,
    owner_asset_used: ownerMode === "required",
    post_format: "carousel",
    preferred_slide_count: 4,
    slides: ["hook", "setup", "development", "reveal"].map((role, index) => ({
      slide: index + 1,
      role,
      scene: `${role} hamster scene`,
      owner_present: ownerMode === "required" && index !== 2
    }))
  };
}

function passingReviews(draft) {
  return draft.slides.map((slide, index) => ({
    run_id: draft.run_id,
    account_key: "hamnimi",
    slide: index + 1,
    attempt: 1,
    identity_score: 90,
    visual_quality_score: 90,
    concept_score: 90,
    carousel_consistency_score: 90,
    ...(slide.owner_present ? { owner_identity_score: 90 } : {}),
    fatal_issue: false,
    notes: "passed"
  }));
}

test("1 Hamnimi Trend Radar actual selector", async () => {
  const result = await select();
  assert.equal(result.idea_source, "trend_radar");
  assert.equal(result.account, "hamnimi");
});

test("2 Hamnimi excludes non-publishable candidates", async () => {
  const result = await select({ trendProvider: async () => ({ concepts: [concept({ publishable: false })] }) });
  assert.equal(result.fallback_reason, "no_publishable_concept");
});

test("3 Hamnimi enforces evidence threshold", async () => {
  const result = await select({ trendProvider: async () => ({ concepts: [concept({ evidence_strength: 49 })] }) });
  assert.equal(result.fallback_reason, "evidence_below_selection_threshold");
});

test("4 Hamnimi excludes declining candidates", async () => {
  const next = concept({ concept_id: "next", title: "Stable miniature", total_score: 90, trend_momentum: "stable" });
  const result = await select({ trendProvider: async () => ({ concepts: [concept({ total_score: 99, trend_momentum: "declining" }), next] }) });
  assert.equal(result.trend_concept_id, "next");
});

test("5 Hamnimi skips recent semantic duplicates", async () => {
  const next = concept({
    concept_id: "next",
    concept_key: "retro-direct-flash-dump",
    title: "Y2K Hamster Portrait",
    description: "직광 디지털카메라 햄스터 화보",
    pet_adaptation: "반려동물 직광 화보",
    dog_adaptation: "강아지 직광 화보",
    hamster_adaptation: "햄스터 직광 디카 화보",
    keywords: ["y2k", "flash", "portrait"],
    total_score: 90
  });
  const result = await select({
    recentPosts: [{ title: "Miniature Hamster Workplace", idea_summary: "작은 햄스터 미니 작업실" }],
    trendProvider: async () => ({ concepts: [concept({ total_score: 99 }), next] })
  });
  assert.equal(result.trend_concept_id, "next");
});

test("6 Hamnimi falls back when no candidate exists", async () => {
  const result = await select({ trendProvider: async () => ({ concepts: [] }) });
  assert.equal(result.idea_source, "fallback_generator");
});

test("7 Hamnimi owner none never uses owner", async () => {
  assert.equal((await select()).owner_asset_used, false);
});

test("8 Hamnimi owner optional omits owner", async () => {
  const result = await select({ trendProvider: async () => ({ concepts: [concept({ owner_mode: "optional" })] }) });
  assert.equal(result.owner_asset_used, false);
});

test("9 Hamnimi owner required uses shared owner reference", async () => {
  const result = await select({ trendProvider: async () => ({ concepts: [concept({ owner_mode: "required" })] }) });
  assert.equal(result.owner_asset_used, true);
});

test("10 unavailable owner-required candidate advances to next Hamnimi trend", async () => {
  const next = concept({ concept_id: "next", title: "Pet only", total_score: 90 });
  const result = await select({
    ownerAssetAvailable: false,
    trendProvider: async () => ({ concepts: [concept({ owner_mode: "required", total_score: 99 }), next] })
  });
  assert.equal(result.trend_concept_id, "next");
});

test("11 Hamnimi carousel builds ordered hamster storyboard", () => {
  const plan = buildGenerationPlan({
    accountName: "hamnimi",
    config: config(),
    concept: concept({ post_format: "carousel", preferred_slide_count: 4 }),
    petReference: "hamnimi.png"
  });
  assert.deepEqual(plan.slides.map(item => item.role), ["hook", "setup", "development", "reveal"]);
  assert.match(plan.slides[0].scene, /햄스터/);
});

test("12 Hamnimi carousel owner none references only Hamnimi", () => {
  const plan = buildGenerationPlan({ accountName: "hamnimi", config: config(), concept: concept({ post_format: "carousel", preferred_slide_count: 4 }), petReference: "hamnimi.png", ownerReference: "owner.png", ownerAssetAvailable: true });
  assert.deepEqual(plan.reference_images, ["hamnimi.png"]);
});

test("13 Hamnimi owner-required carousel supports selective owner slides", () => {
  const plan = buildGenerationPlan({ accountName: "hamnimi", config: config(), concept: concept({ owner_mode: "required", post_format: "carousel", preferred_slide_count: 4 }), petReference: "hamnimi.png", ownerReference: "owner.png", ownerAssetAvailable: true });
  assert.deepEqual(plan.reference_images, ["hamnimi.png", "owner.png"]);
  assert.equal(plan.slides.some(item => item.owner_present), true);
  assert.equal(plan.slides.every(item => item.owner_present), false);
});

test("14 Hamnimi carousel validation keeps all thresholds", () => {
  const draft = carouselDraft("required");
  const result = validateReviewPackage(draft, passingReviews(draft), { accountName: "hamnimi", accountKey: "hamnimi" });
  assert.equal(result.passed, true);
  assert.equal(result.thresholds.carousel_consistency_score, 80);
  assert.equal(result.thresholds.owner_identity_score, 75);
});

test("15 Hamnimi CTA remains the final carousel child", () => {
  const plan = buildInstagramCarouselPlan({
    contentImageUrls: [1, 2, 3, 4].map(index => `https://example.test/ham-${index}.jpg`),
    ctaImageUrl: "https://example.test/hamnimi-cta.jpg",
    caption: "caption",
    altText: "햄님이",
    accountKey: "hamnimi",
    displayName: "햄님이"
  });
  assert.equal(plan.final_slide, "cta_hamnimi");
});

test("16 Hamnimi history persists selection and experience metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hamnimi-history-"));
  try {
    const path = await savePublishedPostMetadata({
      draft: { post_id: "P-TEST", title: "햄님이", category: "이미지" },
      state: {
        updated_at: "2026-08-26T00:00:00Z", instagram_media_id: "media",
        idea_source: "trend_radar", trend_concept_id: "ham-trend-1",
        owner_mode: "required", owner_asset_used: true, post_format: "carousel", slide_count: 4,
        trend_total_score: 95, trend_evidence_strength: 80, trend_momentum: "rising"
      },
      context: { accountKey: "hamnimi", postsDir: directory, statePath: join(directory, "state.json"), summaryPath: join(directory, "summary.json") }
    });
    const saved = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual([saved.account_key, saved.idea_source, saved.slide_count, saved.total_score, saved.evidence_strength, saved.momentum], ["hamnimi", "trend_radar", 4, 95, 80, "rising"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("17 account performance scores remain namespaced", async () => {
  const directory = await mkdtemp(join(tmpdir(), "account-performance-"));
  try {
    await writeFile(join(directory, "account_performance.json"), JSON.stringify({ accounts: { kongi: { concepts: { x: 91 } }, hamnimi: { concepts: { x: 63 } } } }));
    const kongi = await loadPerformanceScores({ dataDir: directory }, "kongi");
    const hamnimi = await loadPerformanceScores({ dataDir: directory }, "hamnimi");
    assert.equal(kongi.concepts.x, 91);
    assert.equal(hamnimi.concepts.x, 63);
    assert.equal(applyAccountPerformance([{ concept_key: "x" }], kongi)[0].performance_potential, 91);
    assert.equal(applyAccountPerformance([{ concept_key: "x" }], hamnimi)[0].performance_potential, 63);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("18 Kongi selection regression remains enabled", async () => {
  const result = await selectIdeaSource({ accountName: "kongi", config: config(), trendProvider: async () => ({ concepts: [concept({ dog_adaptation: "강아지 컨셉" })] }) });
  assert.equal(result.idea_source, "trend_radar");
});

test("19 Hamnimi feature flags default off independently", () => {
  assert.deepEqual(experienceConfigFromEnv({ KONGI_OWNER_REQUIRED_ENABLED: "true" }, "hamnimi"), { ownerRequiredEnabled: false, carouselIdeasEnabled: false, ownerOptionalPolicy: "omit" });
});

test("20 multi-account shadow isolates Hamnimi from Kongi failure", async () => {
  const called = [];
  const result = await executeShadowAccounts({
    accountNames: ["kongi", "hamnimi"],
    executeAccount: async account => {
      called.push(account);
      if (account === "kongi") throw new Error("synthetic Kongi failure");
      return { record: { account }, instagram_posting_attempted: false };
    }
  });
  assert.deepEqual(called, ["kongi", "hamnimi"]);
  assert.deepEqual([result.success_count, result.failure_count, result.instagram_posting_attempted], [1, 1, false]);
});

test("hamster adaptation uses small-scale account language instead of dog substitution", () => {
  const adapted = adaptConcept({
    concept_key: "miniature-world",
    adaptation: "반려동물이 손바닥만 한 작업실에서 일하는 장면",
    fit_scores: { dog: 92, cat: 92, hamster: 100 },
    baseline_scores: { account_fit: 94 }
  }, "hamnimi");
  assert.equal(adapted.account_fit, 100);
  assert.match(adapted.hamster_adaptation, /이중 스케일 대비/);
  assert.doesNotMatch(adapted.hamster_adaptation, /강아지/);
});
