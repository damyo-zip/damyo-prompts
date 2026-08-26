import assert from "node:assert/strict";
import test from "node:test";
import {
  ideaGuidanceForSelection,
  selectIdeaSource,
  selectionConfigFromEnv,
  selectionLogDetails
} from "./idea-selector.mjs";

function config(overrides = {}) {
  return {
    enabled: true,
    accounts: ["kongi"],
    minEvidence: 50,
    allowDeclining: false,
    duplicateThreshold: 0.72,
    ...overrides
  };
}

function concept(overrides = {}) {
  return {
    concept_id: "trend-1",
    title: "Absurd Pet Doorway Cameo",
    description: "문틈에 같은 반려동물이 한 번 더 등장하는 장면",
    original_trend: "Unexpected familiar-character horror cameos",
    pet_adaptation: "Absurd Pet Doorway Cameo",
    dog_adaptation: "문틈에 같은 강아지가 한 번 더 등장하는 장면",
    total_score: 94.3,
    evidence_strength: 89,
    trend_momentum: "rising",
    publishable: true,
    keywords: ["doorway", "cameo", "horror"],
    ...overrides
  };
}

test("enabled Kongi selection adopts the best Trend Radar candidate", async () => {
  const selected = await selectIdeaSource({
    accountName: "kongi",
    config: config(),
    trendProvider: async () => ({ concepts: [concept()] })
  });
  assert.equal(selected.idea_source, "trend_radar");
  assert.equal(selected.trend_concept_id, "trend-1");
  assert.equal(selected.fallback_used, false);
});

test("Kongi falls back when no publishable candidate exists", async () => {
  const selected = await selectIdeaSource({
    accountName: "kongi",
    config: config(),
    trendProvider: async () => ({ concepts: [concept({ publishable: false })] })
  });
  assert.equal(selected.idea_source, "fallback_generator");
  assert.equal(selected.fallback_reason, "no_publishable_concept");
});

test("Hamnimi stays on the existing generator even when configured", async () => {
  let providerCalled = false;
  const selected = await selectIdeaSource({
    accountName: "hamnimi",
    config: config({ accounts: ["kongi", "hamnimi"] }),
    trendProvider: async () => { providerCalled = true; return { concepts: [concept()] }; }
  });
  assert.equal(providerCalled, false);
  assert.equal(selected.fallback_reason, "account_not_supported");
});

test("declining candidates are skipped by default", async () => {
  const declining = concept({ trend_momentum: "declining", total_score: 99 });
  const stable = concept({ concept_id: "trend-2", title: "Stable Trend", trend_momentum: "stable", total_score: 90 });
  const selected = await selectIdeaSource({
    accountName: "kongi",
    config: config(),
    trendProvider: async () => ({ concepts: [declining, stable] })
  });
  assert.equal(selected.trend_concept_id, "trend-2");
  assert.deepEqual(selected.skipped_candidates[0].reasons, ["DECLINING_NOT_ALLOWED"]);
});

test("candidates below the selection evidence threshold are skipped", async () => {
  const selected = await selectIdeaSource({
    accountName: "kongi",
    config: config({ minEvidence: 90 }),
    trendProvider: async () => ({ concepts: [concept({ evidence_strength: 89 })] })
  });
  assert.equal(selected.fallback_used, true);
  assert.equal(selected.fallback_reason, "evidence_below_selection_threshold");
});

test("recently similar top candidate is skipped for the next candidate", async () => {
  const train = concept({ concept_id: "train", title: "완행열차 창가 여행", description: "기차 여행 사진", total_score: 99 });
  const doorway = concept({ concept_id: "doorway", total_score: 94 });
  const selected = await selectIdeaSource({
    accountName: "kongi",
    config: config(),
    recentPosts: [{ title: "기차 여행", idea_summary: "열차 창가 여행" }],
    trendProvider: async () => ({ concepts: [train, doorway] })
  });
  assert.equal(selected.trend_concept_id, "doorway");
  assert.ok(selected.skipped_candidates[0].reasons.includes("RECENTLY_SIMILAR"));
});

test("Trend Radar exceptions fall back without escaping", async () => {
  const selected = await selectIdeaSource({
    accountName: "kongi",
    config: config(),
    trendProvider: async () => { throw new Error("cache unreadable"); }
  });
  assert.equal(selected.fallback_reason, "trend_radar_error");
  assert.equal(selected.radar_error, "cache unreadable");
});

test("selection log metadata records source and fallback state", async () => {
  const selected = await selectIdeaSource({
    accountName: "kongi",
    config: config(),
    trendProvider: async () => ({ concepts: [concept()] })
  });
  assert.deepEqual(selectionLogDetails(selected), {
    idea_source: "trend_radar",
    account: "kongi",
    selected_concept: "Absurd Pet Doorway Cameo",
    trend_concept_id: "trend-1",
    total: 94.3,
    evidence: 89,
    momentum: "rising",
    fallback_used: false,
    fallback_reason: null,
    selection_enabled: true,
    skipped_candidates: [],
    radar_error: null
  });
});

test("selection and fallback paths never attempt Instagram posting", async () => {
  const enabled = await selectIdeaSource({
    accountName: "kongi",
    config: config(),
    trendProvider: async () => ({ concepts: [concept()] })
  });
  const disabled = await selectIdeaSource({ accountName: "kongi", config: config({ enabled: false }) });
  assert.equal(enabled.instagram_posting_attempted, false);
  assert.equal(disabled.instagram_posting_attempted, false);
  assert.equal(disabled.fallback_reason, "feature_flag_disabled");
});

test("selection changes only idea guidance and leaves downstream content generation untouched", async () => {
  const selected = await selectIdeaSource({
    accountName: "kongi",
    config: selectionConfigFromEnv({
      TREND_RADAR_ENABLE_SELECTION: "true",
      TREND_RADAR_SELECTION_ACCOUNTS: "kongi",
      TREND_RADAR_MIN_EVIDENCE: "50",
      TREND_RADAR_ALLOW_DECLINING: "false"
    }),
    trendProvider: async () => ({ concepts: [concept()] })
  });
  const guidance = ideaGuidanceForSelection(selected, ["fallback"]);
  assert.match(guidance[0], /Trend Radar/);
  assert.equal(Object.hasOwn(selected, "prompt"), false);
  assert.equal(Object.hasOwn(selected, "generation_prompt"), false);
  assert.equal(Object.hasOwn(selected, "caption"), false);
});
