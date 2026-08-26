import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { adaptConcept } from "./account-adapter.mjs";
import { analyzeCandidate } from "./analyzer.mjs";
import { parseRss } from "./collectors/candidate-parser.mjs";
import { clusterCandidates } from "./concept-clusterer.mjs";
import defaults from "./config.mjs";
import { filterRecentDuplicates, semanticSimilarity } from "./dedupe.mjs";
import {
  calculateEvidenceStrength,
  calculateTrendMomentum,
  isWeakSignal,
  validateOriginalTrendGrounding,
  validateTrendEvidence
} from "./evidence.mjs";
import { assessPublishability, WatchlistReason } from "./publishability.mjs";
import { executeShadowMode, formatMomentum, getBestTrendForAccount, resolveIdeaWithTrendRadar, runTrendRadar } from "./runner.mjs";
import { applyEvidenceCap, calculateTotalScore, scoreConcept } from "./scorer.mjs";
import { appendShadowHistory, buildShadowRun, calculateShadowChange, loadShadowHistory, pruneShadowRuns } from "./shadow.mjs";
import { cacheIsFresh } from "./storage.mjs";

const fixedNow = new Date("2026-08-26T00:00:00.000Z");

function candidate(title, source = "Example", url = `https://example.com/${encodeURIComponent(title)}`) {
  return {
    source,
    source_url: url,
    title,
    description: `${title} is rising across visual social platforms`,
    published_at: "2026-08-25T00:00:00.000Z",
    collected_at: fixedNow.toISOString(),
    keywords: title.toLowerCase().split(/\s+/)
  };
}

function evidenceCandidate(title, source, url, publishedAt, platform = "web", sourceType = "news_article") {
  return {
    ...candidate(title, source, url),
    published_at: publishedAt,
    platform,
    source_type: sourceType,
    collector: "fixture"
  };
}

function validatedConcept(candidates, config = defaults, now = fixedNow, historyData = {}) {
  const cluster = clusterCandidates(candidates)[0];
  const result = validateTrendEvidence(cluster, { config, now, historyData });
  assert.equal(result.valid, true);
  return result.concept;
}

async function temporaryConfig(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "damyo-trend-radar-"));
  return {
    ...defaults,
    dataDir: join(root, "data"),
    logDir: join(root, "logs"),
    postsDir: join(root, "posts"),
    requestTimeoutMs: 100,
    ...overrides
  };
}

function operationalConcept(overrides = {}) {
  return {
    concept_id: "trend-operational",
    title: "Operational Pet Trend",
    total_score: 82,
    evidence_strength: 70,
    weak_signal: false,
    trend_momentum: "stable",
    recent_source_count_7d: 3,
    trend_score: 80,
    pet_adaptability: 85,
    visual_impact: 85,
    replicability: 80,
    account_fit: 75,
    novelty: 80,
    performance_potential: 50,
    dog_fit_score: 75,
    cat_fit_score: 70,
    hamster_fit_score: 65,
    ...overrides
  };
}

test("candidate parsing normalizes RSS fields", () => {
  const xml = `<rss><channel><item><title><![CDATA[Retro direct flash photo dump - Photo Daily]]></title><link>https://example.com/a</link><description><![CDATA[<b>Hard flash</b> is back]]></description><pubDate>Tue, 25 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
  const [parsed] = parseRss(xml, { now: fixedNow });
  assert.equal(parsed.source, "Photo Daily");
  assert.equal(parsed.title, "Retro direct flash photo dump");
  assert.equal(parsed.description, "Hard flash is back");
  assert.ok(parsed.keywords.includes("retro"));
});

test("concept clustering joins semantically identical candidates", () => {
  const clusters = clusterCandidates([
    candidate("Retro direct flash photo dump", "A", "https://a.example/1"),
    candidate("Digital camera photo dump with direct flash", "B", "https://b.example/1")
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].source_count, 2);
  assert.equal(clusters[0].candidates.length, 2);
});

test("scoring and weighted total calculation are deterministic", () => {
  const total = calculateTotalScore({ a: 100, b: 50 }, { a: 0.75, b: 0.25 });
  assert.equal(total, 87.5);
  const concept = adaptConcept(validatedConcept([
    evidenceCandidate("Paparazzi trend photo shoot", "A", "https://a.example/1", "2026-08-25T00:00:00Z", "instagram"),
    evidenceCandidate("Behind-the-scenes shoot paparazzi framing", "B", "https://b.example/1", "2026-08-24T00:00:00Z", "fashion_editorial")
  ]), "kongi");
  const scored = scoreConcept({ ...concept, novelty: 90 }, { weights: defaults.weights, evidenceConfig: defaults.evidence, now: fixedNow });
  assert.ok(scored.total_score >= 60 && scored.total_score <= 100);
  assert.equal(scored.account_fit, scored.dog_fit_score);
  assert.ok(scored.evidence_strength > 0);
});

test("recent semantic duplicate is excluded and novelty falls", () => {
  assert.ok(semanticSimilarity("완행열차 창가에서 여행하는 강아지", "기차 창가의 반려견 여행") >= 0.5);
  const concept = analyzeCandidate(candidate("Retro direct flash photo dump"));
  const result = filterRecentDuplicates([concept], [{ title: "레트로 디카 직광 반려동물 사진", idea_summary: "2000년대 디카 스냅" }], 0.35);
  assert.equal(result.excluded.length, 1);
  assert.ok(result.excluded[0].novelty < 70);
});

test("account adaptation keeps separate dog, cat, and hamster fit", () => {
  const base = clusterCandidates([candidate("Miniature scale contrast tiny world")])[0];
  const kongi = adaptConcept(base, "kongi");
  const hamnimi = adaptConcept(base, "hamnimi");
  assert.equal(kongi.account_fit, kongi.dog_fit_score);
  assert.equal(hamnimi.account_fit, hamnimi.hamster_fit_score);
  assert.ok(hamnimi.account_fit > kongi.account_fit);
  assert.match(hamnimi.hamster_adaptation, /햄스터/);
});

test("fresh cache prevents network recollection", async () => {
  const config = await temporaryConfig();
  await runTrendRadar({ config, now: fixedNow, forceRefresh: true, inputCandidates: [
    evidenceCandidate("Paparazzi trend photo shoot", "A", "https://a.example/1", "2026-08-25T00:00:00Z", "instagram"),
    evidenceCandidate("Behind-the-scenes shoot paparazzi framing", "B", "https://b.example/1", "2026-08-24T00:00:00Z", "fashion_editorial")
  ] });
  assert.equal(await cacheIsFresh(config, new Date("2026-08-26T01:00:00Z")), true);
  const cached = await runTrendRadar({
    config,
    now: new Date("2026-08-26T01:00:00Z"),
    fetchImpl: async () => { throw new Error("network should not run"); }
  });
  assert.equal(cached.cache_hit, true);
  const selected = await getBestTrendForAccount("hamnimi", { config, now: new Date("2026-08-26T01:00:00Z") });
  assert.equal(selected.ok, true);
  assert.equal(selected.concept.account_fit, selected.concept.hamster_fit_score);
});

test("collector failure falls back to stale cache", async () => {
  const config = await temporaryConfig({ cacheTtlHours: 1 });
  await runTrendRadar({ config, now: fixedNow, forceRefresh: true, inputCandidates: [candidate("Paparazzi trend")] });
  const fallback = await runTrendRadar({
    config,
    now: new Date("2026-08-26T03:00:00Z"),
    forceRefresh: true,
    fetchImpl: async () => { throw new Error("offline"); }
  });
  assert.equal(fallback.stale_fallback, true);
  assert.match(fallback.fallback_reason, /candidate가 없습니다/);
});

test("complete radar failure preserves the legacy idea pipeline", async () => {
  const legacyIdea = { title: "기존 아이디어" };
  const resolved = await resolveIdeaWithTrendRadar({
    accountName: "kongi",
    legacyIdea,
    radar: async () => { throw new Error("analysis failed"); }
  });
  assert.equal(resolved.source, "legacy");
  assert.deepEqual(resolved.idea, legacyIdea);
  assert.equal(resolved.trend_radar.fallback, true);
});

test("selection API returns fallback instead of throwing with no network or cache", async () => {
  const config = await temporaryConfig();
  const result = await getBestTrendForAccount("kongi", {
    config,
    forceRefresh: true,
    fetchImpl: async () => { throw new Error("offline"); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.fallback, true);
  assert.equal(result.concept, null);
});

test("valid radar result becomes the idea input", async () => {
  const trend = { concept_id: "trend-1", title: "Pet Magazine Cover" };
  const resolved = await resolveIdeaWithTrendRadar({
    accountName: "kongi",
    legacyIdea: { title: "legacy" },
    radar: async () => ({ ok: true, fallback: false, concept: trend })
  });
  assert.equal(resolved.source, "trend_radar");
  assert.equal(resolved.idea.concept_id, "trend-1");
});

test("independent source deduplication collapses same publisher and syndicated headline", () => {
  const concept = validatedConcept([
    evidenceCandidate("Direct flash photo dump is back", "Publisher A", "https://a.example/one", "2026-08-25T00:00:00Z", "instagram"),
    evidenceCandidate("Y2K digital camera revival", "Publisher A", "https://a.example/two", "2026-08-24T00:00:00Z", "instagram"),
    evidenceCandidate("Direct flash photo dump is back", "Publisher Mirror", "https://mirror.example/copy", "2026-08-25T00:00:00Z", "web"),
    evidenceCandidate("Polaroid and imperfect exposure photography", "Publisher B", "https://b.example/original", "2026-08-23T00:00:00Z", "photography")
  ]);
  assert.equal(concept.source_count, 4);
  assert.equal(concept.independent_source_count, 2);
  assert.equal(concept.source_evidence.filter(item => item.is_independent).length, 2);
});

test("cross-platform counting uses independent evidence channels", () => {
  const concept = validatedConcept([
    evidenceCandidate("Instagram direct flash photo dump", "A", "https://a.example/1", "2026-08-25T00:00:00Z", "instagram"),
    evidenceCandidate("TikTok Y2K digital camera revival", "B", "https://b.example/1", "2026-08-24T00:00:00Z", "tiktok"),
    evidenceCandidate("Pinterest Polaroid photography moodboard", "C", "https://c.example/1", "2026-08-23T00:00:00Z", "pinterest")
  ]);
  assert.equal(concept.cross_platform_count, 3);
});

test("7d and 30d recency counts exclude old and undated evidence", () => {
  const concept = validatedConcept([
    evidenceCandidate("Direct flash photo dump", "A", "https://a.example/1", "2026-08-25T00:00:00Z", "instagram"),
    evidenceCandidate("Y2K digital camera photography", "B", "https://b.example/1", "2026-08-16T00:00:00Z", "photography"),
    evidenceCandidate("Retro Polaroid revival", "C", "https://c.example/1", "2026-07-01T00:00:00Z", "fashion_editorial"),
    evidenceCandidate("Imperfect exposure direct flash", "D", "https://d.example/1", null, "web")
  ]);
  assert.equal(concept.recent_source_count_7d, 1);
  assert.equal(concept.recent_source_count_30d, 2);
  assert.equal(concept.latest_source_date, "2026-08-25T00:00:00.000Z");
});

test("evidence strength rewards independent recent cross-platform sources", () => {
  const high = calculateEvidenceStrength({
    independent_source_count: 5,
    recent_source_count_7d: 4,
    recent_source_count_30d: 5,
    cross_platform_count: 3,
    average_source_quality: 0.9,
    latest_source_date: "2026-08-25T00:00:00Z"
  }, defaults, fixedNow).evidence_strength;
  const low = calculateEvidenceStrength({
    independent_source_count: 1,
    recent_source_count_7d: 0,
    recent_source_count_30d: 0,
    cross_platform_count: 1,
    average_source_quality: 0.35,
    latest_source_date: null
  }, defaults, fixedNow).evidence_strength;
  assert.ok(high >= 90);
  assert.ok(low < 30);
});

test("trend score is capped by evidence strength", () => {
  assert.equal(applyEvidenceCap(96, 20, defaults.evidence.trendScoreCaps), 50);
  assert.equal(applyEvidenceCap(96, 40, defaults.evidence.trendScoreCaps), 70);
  assert.equal(applyEvidenceCap(96, 60, defaults.evidence.trendScoreCaps), 85);
  assert.equal(applyEvidenceCap(96, 80, defaults.evidence.trendScoreCaps), 96);
});

test("weak signal handling marks and penalizes one-source concepts", () => {
  const concept = adaptConcept(validatedConcept([
    evidenceCandidate("Paparazzi trend photo shoot", "A", "https://a.example/1", "2026-08-25T00:00:00Z", "instagram")
  ]), "kongi");
  assert.equal(isWeakSignal(concept, defaults), true);
  const scored = scoreConcept({ ...concept, novelty: 90 }, { weights: defaults.weights, evidenceConfig: defaults.evidence, now: fixedNow });
  assert.equal(scored.weak_signal_penalty, defaults.evidence.weakSignalPenalty);
  assert.equal(scored.total_score, Number((scored.raw_total_score - defaults.evidence.weakSignalPenalty).toFixed(1)));
});

test("source provenance is preserved in final concept evidence", () => {
  const input = evidenceCandidate("Direct flash photo dump", "Photo Daily", "https://photo.example/story", "2026-08-25T00:00:00Z", "instagram", "professional_media");
  const concept = validatedConcept([input]);
  assert.deepEqual(concept.source_evidence[0], {
    source_name: "Photo Daily",
    source_type: "professional_media",
    platform: "instagram",
    domain: "photo.example",
    url: "https://photo.example/story",
    title: "Direct flash photo dump",
    published_at: "2026-08-25T00:00:00.000Z",
    date_status: "known",
    source_quality: 0.88,
    signal_summary: "Direct flash photo dump — Direct flash photo dump is rising across visual social platforms",
    publisher_key: "photo.example",
    is_independent: true,
    independent_group: "source-group-01"
  });
});

test("original trend and pet adaptation remain explicitly separated", () => {
  const analyzed = analyzeCandidate(candidate("Retro direct flash photo dump"));
  assert.equal(analyzed.original_trend, "Direct-flash casual photo dumps and Y2K digital-camera photography");
  assert.equal(analyzed.pet_adaptation, "Retro Direct-Flash Pet Dump");
  assert.notEqual(analyzed.original_trend, analyzed.pet_adaptation);
});

test("Trend Radar adds conservative owner and carousel metadata", () => {
  const analyzed = analyzeCandidate(candidate("Retro direct flash photo dump"));
  assert.equal(analyzed.owner_mode, "optional");
  assert.equal(analyzed.post_format, "carousel");
  assert.equal(analyzed.preferred_slide_count, 4);
  assert.ok(analyzed.carousel_fit_score >= 80);
});

test("direct owner-pet comparison is the only kind marked owner required", () => {
  const analyzed = analyzeCandidate(candidate("Owner and pet matching pose comparison portrait"));
  assert.equal(analyzed.owner_mode, "required");
  assert.match(analyzed.owner_requirement_reason, /human-pet comparison/i);
});

test("ordinary pet concepts keep owner none and single defaults", () => {
  const analyzed = analyzeCandidate(candidate("Pet fashion magazine cover portrait"));
  assert.equal(analyzed.owner_mode, "none");
  assert.equal(analyzed.post_format, "single");
  assert.equal(analyzed.preferred_slide_count, 1);
});

test("hallucinated original trend without source grounding is rejected", () => {
  const fabricated = {
    concept_id: "fake",
    original_trend: "Rainbow Cosmic Pet Dream Portal",
    pet_adaptation: "Cosmic Pet Portal",
    candidates: [candidate("Direct flash photo dump")],
    grounding_patterns: [],
    grounded_candidate_urls: []
  };
  assert.equal(validateOriginalTrendGrounding(fabricated), false);
  assert.equal(validateTrendEvidence(fabricated, { config: defaults, now: fixedNow }).reason, "original_trend_not_grounded");
});

test("trend momentum compares the latest prior evidence snapshot", () => {
  const concept = { concept_id: "trend-1", independent_source_count: 6 };
  assert.equal(calculateTrendMomentum(concept, {}, fixedNow), "unknown");
  const history = { snapshots: [{ captured_at: "2026-08-25T00:00:00Z", concepts: [{ concept_id: "trend-1", independent_source_count: 2 }] }] };
  assert.equal(calculateTrendMomentum(concept, history, fixedNow), "rising");
  assert.equal(calculateTrendMomentum({ ...concept, concept_id: "new" }, history, fixedNow), "new");
  assert.equal(calculateTrendMomentum({ ...concept, independent_source_count: 1 }, { snapshots: [{ captured_at: "2026-08-25T00:00:00Z", concepts: [{ concept_id: "trend-1", independent_source_count: 6 }] }] }, fixedNow), "declining");
  assert.equal(calculateTrendMomentum({ ...concept, independent_source_count: 3 }, { snapshots: [{ captured_at: "2026-08-25T00:00:00Z", concepts: [{ concept_id: "trend-1", independent_source_count: 3 }] }] }, fixedNow), "stable");
});

test("publishable evidence threshold is configurable", () => {
  const concept = operationalConcept({ evidence_strength: 55 });
  assert.equal(assessPublishability(concept, { ...defaults, publishable: { minEvidence: 50 } }).publishable, true);
  assert.equal(assessPublishability(concept, { ...defaults, publishable: { minEvidence: 60 } }).publishable, false);
});

test("publishable calculation stores decision fields", () => {
  const accepted = assessPublishability(operationalConcept(), defaults);
  const rejected = assessPublishability(operationalConcept({ evidence_strength: 49 }), defaults);
  assert.deepEqual(accepted.publishable_rejection_reasons, []);
  assert.equal(accepted.publishable_reason, "");
  assert.equal(rejected.publishable_reason, "Evidence below publishable threshold");
  assert.deepEqual(rejected.publishable_rejection_reasons, ["evidence_strength 49 < 50"]);
});

test("weak signal is never publishable", () => {
  const result = assessPublishability(operationalConcept({ weak_signal: true, evidence_strength: 90 }), defaults);
  assert.equal(result.publishable, false);
  assert.ok(result.publishable_rejection_reasons.includes("weak_signal is true"));
});

test("evidence below threshold is not publishable", () => {
  const result = assessPublishability(operationalConcept({ evidence_strength: 49 }), defaults);
  assert.equal(result.publishable, false);
  assert.ok(result.publishable_rejection_reasons.includes("evidence_strength 49 < 50"));
});

test("getBestTrendForAccount returns only publishable candidates", async () => {
  const config = await temporaryConfig();
  const result = await getBestTrendForAccount("kongi", {
    config,
    now: fixedNow,
    forceRefresh: true,
    inputCandidates: [
      evidenceCandidate("Paparazzi trend photo shoot", "A", "https://a.example/1", "2026-08-25T00:00:00Z", "instagram"),
      evidenceCandidate("Behind-the-scenes shoot paparazzi framing", "B", "https://b.example/1", "2026-08-24T00:00:00Z", "fashion_editorial")
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.concept.publishable, true);
  assert.ok(result.concept.evidence_strength >= config.publishable.minEvidence);
});

test("no publishable candidate returns the legacy fallback boundary", async () => {
  const config = await temporaryConfig();
  const result = await getBestTrendForAccount("kongi", {
    config,
    now: fixedNow,
    forceRefresh: true,
    inputCandidates: [evidenceCandidate("Paparazzi trend photo shoot", "A", "https://a.example/1", "2026-08-25T00:00:00Z", "instagram")]
  });
  assert.equal(result.ok, false);
  assert.equal(result.fallback, true);
  assert.equal(result.reason, "no_publishable_concept");
});

test("watchlist classifies useful non-publishable signals", () => {
  const result = assessPublishability(operationalConcept({
    evidence_strength: 49,
    trend_momentum: "declining",
    recent_source_count_7d: 1
  }), defaults);
  assert.equal(result.watchlist, true);
  assert.deepEqual(result.watchlist_reasons, [
    WatchlistReason.LOW_EVIDENCE,
    WatchlistReason.DECLINING,
    WatchlistReason.INSUFFICIENT_RECENT_SIGNAL
  ]);
});

test("shadow history appends runs", async () => {
  const config = await temporaryConfig();
  const concept = { ...operationalConcept(), ...assessPublishability(operationalConcept(), config) };
  const run = buildShadowRun({ concepts: [concept] }, "kongi", { runs: [] }, fixedNow, config);
  await appendShadowHistory(config, run, fixedNow);
  const history = await loadShadowHistory(config);
  assert.equal(history.runs.length, 1);
  assert.equal(history.runs[0].selected_concept_id, concept.concept_id);
});

test("shadow history keeps accounts separated", async () => {
  const config = await temporaryConfig();
  await appendShadowHistory(config, { run_at: "2026-08-25T00:00:00Z", account: "kongi", top_publishable: [], watchlist: [] }, fixedNow);
  await appendShadowHistory(config, { run_at: fixedNow.toISOString(), account: "hamnimi", top_publishable: [], watchlist: [] }, fixedNow);
  const history = await loadShadowHistory(config);
  assert.deepEqual(history.runs.map(run => run.account), ["kongi", "hamnimi"]);
});

test("shadow mode never enters the Instagram posting flow and tolerates history failure", async () => {
  const config = await temporaryConfig();
  const concept = operationalConcept();
  const shadow = await executeShadowMode({
    accountName: "kongi",
    config,
    now: fixedNow,
    radarRunner: async () => ({ generated_at: fixedNow.toISOString(), concepts: [concept] }),
    historyLoader: async () => ({ runs: [] }),
    historyWriter: async () => { throw new Error("disk unavailable"); }
  });
  assert.equal(shadow.mode, "shadow");
  assert.equal(shadow.instagram_posting_attempted, false);
  assert.equal(shadow.record.selected_concept_id, concept.concept_id);
  assert.equal(shadow.history_write_error, "disk unavailable");
});

test("shadow history retention enforces age and run limits", () => {
  const config = { ...defaults, shadow: { ...defaults.shadow, retentionDays: 2, maxRuns: 2 } };
  const runs = [
    { run_at: "2026-08-20T00:00:00Z" },
    { run_at: "2026-08-24T00:00:00Z" },
    { run_at: "2026-08-25T00:00:00Z" },
    { run_at: "2026-08-26T00:00:00Z" }
  ];
  assert.deepEqual(pruneShadowRuns(runs, config, fixedNow).map(run => run.run_at), ["2026-08-25T00:00:00Z", "2026-08-26T00:00:00Z"]);
});

test("rising display and previous snapshot comparison show deltas", () => {
  const change = calculateShadowChange(
    { run_at: "2026-08-25T00:00:00Z", total_score: 90.1, evidence_strength: 75, trend_momentum: "unknown" },
    { total_score: 92.4, evidence_strength: 81, trend_momentum: "rising" }
  );
  assert.equal(formatMomentum("rising"), "↑ RISING");
  assert.deepEqual(change.total_score, { from: 90.1, to: 92.4, delta: 2.3 });
  assert.deepEqual(change.evidence_strength, { from: 75, to: 81, delta: 6 });
  assert.equal(change.momentum.to, "rising");
});
