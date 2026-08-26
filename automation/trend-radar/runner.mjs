import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { adaptConcept } from "./account-adapter.mjs";
import { clusterCandidates } from "./concept-clusterer.mjs";
import configDefaults from "./config.mjs";
import { collectReddit } from "./collectors/reddit-collector.mjs";
import { collectEditorialPages, collectSearchResults } from "./collectors/web-collector.mjs";
import { filterRecentDuplicates } from "./dedupe.mjs";
import { validateTrendEvidence } from "./evidence.mjs";
import { assessPublishability } from "./publishability.mjs";
import { calculateTotalScore, scoreConcept } from "./scorer.mjs";
import { appendShadowHistory, buildShadowRun, loadShadowHistory } from "./shadow.mjs";
import {
  appendRadarLog,
  cacheIsFresh,
  dataPaths,
  loadCachedConcepts,
  loadPerformanceScores,
  loadPostHistory,
  loadTrendHistoryData,
  readJson,
  recordRadarSnapshot,
  recordSelection,
  writeJson
} from "./storage.mjs";

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(candidate => {
    const key = candidate.source_url || `${candidate.source}:${candidate.title}`;
    if (!candidate.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withinDays(candidate, days, now) {
  if (!candidate.published_at) return true;
  const age = now.getTime() - new Date(candidate.published_at).getTime();
  return age >= 0 && age <= days * 86_400_000;
}

async function collectCandidates({ config, fetchImpl = fetch, now = new Date() }) {
  const collectors = [
    ["web_search", () => collectSearchResults({ config, fetchImpl, now })],
    ["editorial", () => collectEditorialPages({ config, fetchImpl, now })],
    ["reddit", () => collectReddit({ config, fetchImpl, now })]
  ];
  const settled = await Promise.allSettled(collectors.map(([, collect]) => collect()));
  const candidates = [];
  const errors = [];
  const collectorStats = {};
  settled.forEach((result, index) => {
    const name = collectors[index][0];
    if (result.status === "rejected") {
      collectorStats[name] = 0;
      errors.push(`${name}: ${result.reason.message}`);
      return;
    }
    collectorStats[name] = result.value.candidates.length;
    candidates.push(...result.value.candidates);
    errors.push(...result.value.errors.map(error => `${name}: ${error}`));
  });
  const unique = uniqueCandidates(candidates);
  const recent = unique.filter(candidate => withinDays(candidate, config.recentWindowDays, now));
  const selected = recent.length >= config.minimumConcepts ? recent : unique.filter(candidate => withinDays(candidate, config.extendedWindowDays, now));
  return { candidates: selected, errors, collectorStats, usedWindowDays: recent.length >= config.minimumConcepts ? config.recentWindowDays : config.extendedWindowDays };
}

function publicConcept(concept) {
  return {
    concept_id: concept.concept_id,
    title: concept.title,
    description: concept.description,
    original_trend: concept.original_trend,
    pet_adaptation: concept.pet_adaptation,
    source_urls: concept.source_evidence.map(item => item.url).filter(Boolean),
    source_count: concept.source_count,
    independent_source_count: concept.independent_source_count,
    recent_source_count_7d: concept.recent_source_count_7d,
    recent_source_count_30d: concept.recent_source_count_30d,
    cross_platform_count: concept.cross_platform_count,
    first_seen_at: concept.first_seen_at,
    last_seen_at: concept.last_seen_at,
    latest_source_date: concept.latest_source_date,
    evidence_strength: concept.evidence_strength,
    evidence_components: concept.evidence_components,
    source_evidence: concept.source_evidence,
    weak_signal: concept.weak_signal,
    trend_momentum: concept.trend_momentum,
    trend_score: concept.trend_score,
    pet_adaptability: concept.pet_adaptability,
    visual_impact: concept.visual_impact,
    replicability: concept.replicability,
    account_fit: concept.account_fit,
    novelty: concept.novelty,
    performance_potential: concept.performance_potential,
    total_score: concept.total_score,
    raw_total_score: concept.raw_total_score,
    weak_signal_penalty: concept.weak_signal_penalty,
    publishable: concept.publishable,
    publishable_reason: concept.publishable_reason,
    publishable_rejection_reasons: concept.publishable_rejection_reasons,
    watchlist: concept.watchlist,
    watchlist_reasons: concept.watchlist_reasons,
    dog_fit_score: concept.dog_fit_score,
    cat_fit_score: concept.cat_fit_score,
    hamster_fit_score: concept.hamster_fit_score,
    why_trending: concept.why_trending_evidence.join("; "),
    why_trending_evidence: concept.why_trending_evidence,
    why_good_for_pet_account: "보호자 사진 한 장을 명확한 반려동물 중심 장면으로 바꾸고 ‘우리 아이로 만들어보세요’ CTA에 연결할 수 있음",
    dog_adaptation: concept.dog_adaptation,
    cat_adaptation: concept.cat_adaptation,
    hamster_adaptation: concept.hamster_adaptation,
    example_prompt_direction: `첨부한 반려동물과 동일한 개체성을 유지하고, ${concept.adaptation || concept.dog_adaptation || concept.description}. Instagram 세로 4:5, 글자와 워터마크 제외.`,
    keywords: concept.keywords,
    concept_key: concept.concept_key,
    baseline_scores: concept.baseline_scores,
    fit_scores: concept.fit_scores
  };
}

async function analyzeAndScore(candidates, { config, accountName, now = new Date(), postHistory = [], historyData = { selections: [], snapshots: [] }, performanceScores = { defaultScore: 50, concepts: {} } }) {
  const rawClusters = clusterCandidates(candidates);
  const evidenceResults = rawClusters.map(concept => validateTrendEvidence(concept, { config, now, historyData }));
  const invalidEvidence = evidenceResults.filter(result => !result.valid);
  const clusters = evidenceResults.filter(result => result.valid).map(result => adaptConcept(result.concept, accountName));
  const recentTrendSelections = (historyData.selections || [])
    .filter(item => now.getTime() - new Date(item.selected_at).getTime() <= config.recentPostDays * 86_400_000)
    .map(item => ({ concept_title: item.concept_title }));
  const relevantPosts = postHistory.filter(post => !post.account_key || post.account_key === accountName);
  const { included, excluded } = filterRecentDuplicates(clusters, [...relevantPosts, ...recentTrendSelections]);
  const concepts = included
    .map(concept => scoreConcept(concept, {
      weights: config.weights,
      evidenceConfig: config.evidence,
      now,
      performancePotential: Number(performanceScores.concepts[concept.concept_key] ?? performanceScores.defaultScore ?? 50)
    }))
    .map(concept => ({ ...concept, ...assessPublishability(concept, config) }))
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, config.maximumConcepts)
    .map(publicConcept);
  return {
    concepts,
    clusterCount: rawClusters.length,
    evidenceValidatedCount: clusters.length,
    ungroundedCount: invalidEvidence.length,
    weakSignalCount: concepts.filter(concept => concept.weak_signal).length,
    publishableCount: concepts.filter(concept => concept.publishable).length,
    watchlistCount: concepts.filter(concept => concept.watchlist).length,
    duplicateCount: excluded.length,
    excluded,
    invalidEvidence
  };
}

async function runTrendRadar({
  accountName = "kongi",
  config = configDefaults,
  fetchImpl = fetch,
  now = new Date(),
  forceRefresh = false,
  inputCandidates = null,
  allowStaleFallback = true
} = {}) {
  if (!forceRefresh && !inputCandidates && await cacheIsFresh(config, now)) {
    const cached = await loadCachedConcepts(config);
    await appendRadarLog(config, "cache_hit", { account_name: accountName, concept_count: cached.concepts.length }, now);
    return { ...cached, cache_hit: true };
  }

  const paths = dataPaths(config);
  try {
    const collection = inputCandidates
      ? { candidates: uniqueCandidates(inputCandidates), errors: [], collectorStats: { fixture: inputCandidates.length }, usedWindowDays: config.recentWindowDays }
      : await collectCandidates({ config, fetchImpl, now });
    if (!collection.candidates.length) throw new Error("수집된 trend candidate가 없습니다.");
    const [postHistory, historyData, performanceScores] = await Promise.all([
      loadPostHistory(config, now),
      loadTrendHistoryData(config),
      loadPerformanceScores(config, accountName)
    ]);
    const analysis = await analyzeAndScore(collection.candidates, { config, accountName, now, postHistory, historyData, performanceScores });
    if (!analysis.concepts.length) throw new Error("분석 및 중복 제거 후 유효한 concept가 없습니다.");
    const result = {
      schema_version: 2,
      generated_at: now.toISOString(),
      account_name: accountName,
      cache_ttl_hours: config.cacheTtlHours,
      window_days: collection.usedWindowDays,
      candidate_count: collection.candidates.length,
      cluster_count: analysis.clusterCount,
      evidence_validated_count: analysis.evidenceValidatedCount,
      ungrounded_count: analysis.ungroundedCount,
      weak_signal_count: analysis.weakSignalCount,
      publishable_count: analysis.publishableCount,
      watchlist_count: analysis.watchlistCount,
      duplicate_count: analysis.duplicateCount,
      collector_stats: collection.collectorStats,
      errors: collection.errors,
      concepts: analysis.concepts,
      cache_hit: false
    };
    await writeJson(paths.candidates, { generated_at: now.toISOString(), candidates: collection.candidates });
    await writeJson(paths.concepts, result);
    await recordRadarSnapshot(config, analysis.concepts, now);
    if (await readJson(paths.performance, null) === null) {
      await writeJson(paths.performance, { updated_at: null, accounts: {}, note: "Insights 표본이 충분해지기 전에는 performance_potential=50을 사용합니다." });
    }
    await appendRadarLog(config, "completed", {
      source_count: new Set(collection.candidates.map(item => item.source)).size,
      raw_candidate_count: collection.candidates.length,
      concept_count: analysis.clusterCount,
      evidence_validated_count: analysis.evidenceValidatedCount,
      weak_signal_count: analysis.weakSignalCount,
      publishable_count: analysis.publishableCount,
      watchlist_count: analysis.watchlistCount,
      duplicate_count: analysis.duplicateCount,
      top_concept: analysis.concepts[0]?.title,
      errors: collection.errors
    }, now);
    return result;
  } catch (error) {
    await appendRadarLog(config, "fallback", { account_name: accountName, reason: error.message }, now);
    if (allowStaleFallback) {
      const cached = await loadCachedConcepts(config);
      if (cached?.schema_version === 2 && cached?.concepts?.length) return { ...cached, cache_hit: true, stale_fallback: true, fallback_reason: error.message };
    }
    throw error;
  }
}

function prepareResultForAccount(result, accountName, config = configDefaults) {
  const key = String(accountName).toLowerCase();
  const accountFitKey = key === "hamnimi" || key === "hamster"
    ? "hamster_fit_score"
    : key === "cat"
      ? "cat_fit_score"
      : "dog_fit_score";
  const concepts = (result.concepts || [])
    .map(concept => {
      const accountFit = concept[accountFitKey] ?? concept.account_fit;
      const scores = { ...concept, account_fit: accountFit };
      const rawTotalScore = calculateTotalScore(scores, config.weights);
      const weakSignalPenalty = concept.weak_signal ? Number(config.evidence?.weakSignalPenalty || 0) : 0;
      const rescored = {
        ...scores,
        raw_total_score: rawTotalScore,
        weak_signal_penalty: weakSignalPenalty,
        total_score: Number(Math.max(0, rawTotalScore - weakSignalPenalty).toFixed(1))
      };
      return { ...rescored, ...assessPublishability(rescored, config) };
    })
    .sort((a, b) => b.total_score - a.total_score);
  return {
    ...result,
    account_name: accountName,
    concepts,
    weak_signal_count: concepts.filter(concept => concept.weak_signal).length,
    publishable_count: concepts.filter(concept => concept.publishable).length,
    watchlist_count: concepts.filter(concept => concept.watchlist).length
  };
}

async function getBestTrendForAccount(accountName, options = {}) {
  try {
    const result = await runTrendRadar({ accountName, ...options });
    const accountResult = prepareResultForAccount(result, accountName, options.config || configDefaults);
    const concept = accountResult.concepts.find(item => item.publishable) || null;
    if (!concept) return { ok: false, fallback: true, reason: "no_publishable_concept", concept: null };
    if (options.recordSelection) await recordSelection(options.config || configDefaults, { account_name: accountName, concept }, options.now || new Date());
    await appendRadarLog(options.config || configDefaults, "selected", { account_name: accountName, concept_id: concept.concept_id, concept_title: concept.title }, options.now || new Date());
    return { ok: true, fallback: false, cache_hit: result.cache_hit, stale_fallback: Boolean(result.stale_fallback), concept };
  } catch (error) {
    await appendRadarLog(options.config || configDefaults, "selection_fallback", { account_name: accountName, reason: error.message }, options.now || new Date()).catch(() => {});
    return { ok: false, fallback: true, reason: error.message, concept: null };
  }
}

async function executeShadowMode({
  accountName = "kongi",
  config = configDefaults,
  now = new Date(),
  radarOptions = {},
  radarRunner = runTrendRadar,
  historyLoader = loadShadowHistory,
  historyWriter = appendShadowHistory
} = {}) {
  const rawResult = await radarRunner({ accountName, config, now, ...radarOptions });
  const result = prepareResultForAccount(rawResult, accountName, config);
  let history = { runs: [] };
  try {
    history = await historyLoader(config);
  } catch (error) {
    await appendRadarLog(config, "shadow_history_read_failed", { account_name: accountName, reason: error.message }, now).catch(() => {});
  }
  const record = buildShadowRun(result, accountName, history, now, config);
  let historyWriteError = null;
  try {
    await historyWriter(config, record, now);
  } catch (error) {
    historyWriteError = error.message;
    await appendRadarLog(config, "shadow_history_write_failed", { account_name: accountName, reason: error.message }, now).catch(() => {});
  }
  return {
    mode: "shadow",
    instagram_posting_attempted: false,
    result,
    record,
    history_write_error: historyWriteError
  };
}

async function resolveIdeaWithTrendRadar({ accountName, legacyIdea = null, radar = getBestTrendForAccount, radarOptions = {} }) {
  try {
    const trend = await radar(accountName, radarOptions);
    return trend?.ok ? { source: "trend_radar", idea: trend.concept, trend_radar: trend } : { source: "legacy", idea: legacyIdea, trend_radar: trend };
  } catch (error) {
    return { source: "legacy", idea: legacyIdea, trend_radar: { ok: false, fallback: true, reason: error.message, concept: null } };
  }
}

function formatMomentum(momentum) {
  return momentum === "rising" ? "↑ RISING" : String(momentum || "unknown").toUpperCase();
}

function printConcept(concept, index, result, { showEvidence = false, watchlist = false } = {}) {
  const accountAdaptation = result.account_name === "hamnimi" ? concept.hamster_adaptation : result.account_name === "cat" ? concept.cat_adaptation : concept.dog_adaptation;
  console.log(`#${index + 1} ${concept.title}`);
  console.log(`TOTAL: ${concept.total_score}`);
  console.log(`EVIDENCE: ${concept.evidence_strength}`);
  console.log(`MOMENTUM: ${formatMomentum(concept.trend_momentum)}`);
  if (concept.weak_signal) console.log("WEAK SIGNAL");
  if (watchlist) {
    console.log("\nWHY NOT PUBLISHABLE:");
    concept.publishable_rejection_reasons.forEach(reason => console.log(`- ${reason}`));
    const observationReasons = concept.watchlist_reasons.filter(reason => !["LOW_EVIDENCE", "WEAK_SIGNAL"].includes(reason));
    observationReasons.forEach(reason => console.log(`- ${reason}`));
  }
  console.log("\nORIGINAL TREND");
  console.log(concept.original_trend);
  console.log("\nPET ADAPTATION");
  console.log(accountAdaptation);
  console.log("\nSCORES");
  console.log(`Trend: ${concept.trend_score} · Evidence: ${concept.evidence_strength} · Pet: ${concept.pet_adaptability} · Visual: ${concept.visual_impact} · Replicable: ${concept.replicability} · Fit: ${concept.account_fit} · Novelty: ${concept.novelty}`);
  console.log("\nEVIDENCE");
  console.log(`Independent sources: ${concept.independent_source_count} · Recent 7d: ${concept.recent_source_count_7d} · Recent 30d: ${concept.recent_source_count_30d} · Platforms: ${concept.cross_platform_count}`);
  console.log(`Latest signal: ${concept.latest_source_date?.slice(0, 10) || "unknown"} · Momentum: ${formatMomentum(concept.trend_momentum)}`);
  console.log("\nWHY TRENDING");
  concept.why_trending_evidence.forEach(reason => console.log(`- ${reason}`));
  console.log("\nTOP SOURCES");
  concept.source_evidence.slice(0, showEvidence ? concept.source_evidence.length : 3).forEach((source, sourceIndex) => {
    console.log(`${sourceIndex + 1}. ${source.title} — ${source.published_at?.slice(0, 10) || "date unknown"}${source.is_independent ? " · independent" : " · duplicate/related"}`);
    if (showEvidence) console.log(`   ${source.source_name} · ${source.source_type} · ${source.platform} · q=${source.source_quality} · ${source.url}`);
  });
  console.log("--------------------------------");
}

function printTopConcepts(result, limit = 10, { showEvidence = false } = {}) {
  console.log(`TREND RADAR — ${result.generated_at.slice(0, 10)}${result.cache_hit ? " (CACHE)" : ""}`);
  console.log(`Account: ${result.account_name}`);
  console.log(`Candidates ${result.candidate_count} · Concepts ${result.cluster_count} · Publishable ${result.publishable_count || 0} · Watchlist ${result.watchlist_count || 0} · Weak ${result.weak_signal_count || 0} · Duplicates ${result.duplicate_count}\n`);
  const publishable = result.concepts.filter(concept => concept.publishable).sort((a, b) => b.total_score - a.total_score).slice(0, limit);
  const remaining = Math.max(0, limit - publishable.length);
  const watchlist = result.concepts.filter(concept => concept.watchlist).sort((a, b) => b.total_score - a.total_score).slice(0, remaining);
  console.log("PUBLISHABLE TRENDS");
  console.log("==================\n");
  if (!publishable.length) console.log("(none)\n");
  publishable.forEach((concept, index) => printConcept(concept, index, result, { showEvidence }));
  console.log("\nWATCHLIST / WEAK SIGNALS");
  console.log("========================\n");
  if (!watchlist.length) console.log("(none)\n");
  watchlist.forEach((concept, index) => printConcept(concept, index, result, { showEvidence, watchlist: true }));
}

function signed(value) {
  return Number(value) >= 0 ? `+${value}` : String(value);
}

function printShadowSummary(shadow) {
  const { record } = shadow;
  console.log("\nSHADOW MODE");
  console.log("===========");
  console.log(`Account: ${record.account}`);
  console.log(`Hypothetical selection: ${record.selected_concept || "none"}`);
  console.log(`Publishable candidates: ${record.publishable_count}`);
  console.log("Instagram posting attempted: NO");
  if (record.change_from_previous) {
    const change = record.change_from_previous;
    console.log("\nCHANGE FROM PREVIOUS");
    console.log(`Evidence: ${change.evidence_strength.from} → ${change.evidence_strength.to} (${signed(change.evidence_strength.delta)})`);
    console.log(`Total: ${change.total_score.from} → ${change.total_score.to} (${signed(change.total_score.delta)})`);
    console.log(`Momentum: ${formatMomentum(change.momentum.to)}`);
  }
  if (shadow.history_write_error) console.log(`Shadow history warning: ${shadow.history_write_error}`);
}

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const fixturePath = option("--input");
  const fixture = fixturePath ? JSON.parse(await readFile(resolve(fixturePath), "utf8")) : null;
  const accountName = option("--account", "kongi");
  const radarOptions = {
    forceRefresh: process.argv.includes("--refresh") || Boolean(fixture),
    inputCandidates: fixture?.candidates || fixture
  };
  if (process.argv.includes("--shadow")) {
    const shadow = await executeShadowMode({ accountName, radarOptions });
    printTopConcepts(shadow.result, Number(option("--limit", 10)), { showEvidence: process.argv.includes("--show-evidence") });
    printShadowSummary(shadow);
    return;
  }
  const rawResult = await runTrendRadar({ accountName, ...radarOptions });
  const result = prepareResultForAccount(rawResult, accountName, configDefaults);
  printTopConcepts(result, Number(option("--limit", 10)), { showEvidence: process.argv.includes("--show-evidence") });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`TREND RADAR FALLBACK: ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  analyzeAndScore,
  collectCandidates,
  executeShadowMode,
  formatMomentum,
  getBestTrendForAccount,
  prepareResultForAccount,
  printShadowSummary,
  printTopConcepts,
  publicConcept,
  resolveIdeaWithTrendRadar,
  runTrendRadar,
  uniqueCandidates,
  withinDays
};
