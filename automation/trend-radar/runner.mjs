import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { adaptConcept } from "./account-adapter.mjs";
import { clusterCandidates } from "./concept-clusterer.mjs";
import configDefaults from "./config.mjs";
import { collectReddit } from "./collectors/reddit-collector.mjs";
import { collectEditorialPages, collectSearchResults } from "./collectors/web-collector.mjs";
import { filterRecentDuplicates } from "./dedupe.mjs";
import { calculateTotalScore, scoreConcept } from "./scorer.mjs";
import {
  appendRadarLog,
  cacheIsFresh,
  dataPaths,
  loadCachedConcepts,
  loadPerformanceScores,
  loadPostHistory,
  loadTrendHistory,
  readJson,
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
    source_urls: concept.source_urls,
    source_count: concept.source_count,
    first_seen_at: concept.first_seen_at,
    last_seen_at: concept.last_seen_at,
    trend_score: concept.trend_score,
    pet_adaptability: concept.pet_adaptability,
    visual_impact: concept.visual_impact,
    replicability: concept.replicability,
    account_fit: concept.account_fit,
    novelty: concept.novelty,
    performance_potential: concept.performance_potential,
    total_score: concept.total_score,
    dog_fit_score: concept.dog_fit_score,
    cat_fit_score: concept.cat_fit_score,
    hamster_fit_score: concept.hamster_fit_score,
    why_trending: `${concept.source_count}개 독립 출처에서 최근 ${concept.candidates?.length || concept.source_urls?.length || 1}건의 신호가 감지됨`,
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

async function analyzeAndScore(candidates, { config, accountName, now = new Date(), postHistory = [], trendHistory = [], performanceScores = { defaultScore: 50, concepts: {} } }) {
  const clusters = clusterCandidates(candidates).map(concept => adaptConcept(concept, accountName));
  const recentTrendSelections = trendHistory
    .filter(item => now.getTime() - new Date(item.selected_at).getTime() <= config.recentPostDays * 86_400_000)
    .map(item => ({ concept_title: item.concept_title }));
  const relevantPosts = postHistory.filter(post => !post.account_key || post.account_key === accountName);
  const { included, excluded } = filterRecentDuplicates(clusters, [...relevantPosts, ...recentTrendSelections]);
  const concepts = included
    .map(concept => scoreConcept(concept, {
      weights: config.weights,
      now,
      performancePotential: Number(performanceScores.concepts[concept.concept_key] ?? performanceScores.defaultScore ?? 50)
    }))
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, config.maximumConcepts)
    .map(publicConcept);
  return { concepts, clusterCount: clusters.length, duplicateCount: excluded.length, excluded };
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
    const [postHistory, trendHistory, performanceScores] = await Promise.all([
      loadPostHistory(config, now),
      loadTrendHistory(config),
      loadPerformanceScores(config, accountName)
    ]);
    const analysis = await analyzeAndScore(collection.candidates, { config, accountName, now, postHistory, trendHistory, performanceScores });
    if (!analysis.concepts.length) throw new Error("분석 및 중복 제거 후 유효한 concept가 없습니다.");
    const result = {
      generated_at: now.toISOString(),
      account_name: accountName,
      cache_ttl_hours: config.cacheTtlHours,
      window_days: collection.usedWindowDays,
      candidate_count: collection.candidates.length,
      cluster_count: analysis.clusterCount,
      duplicate_count: analysis.duplicateCount,
      collector_stats: collection.collectorStats,
      errors: collection.errors,
      concepts: analysis.concepts,
      cache_hit: false
    };
    await writeJson(paths.candidates, { generated_at: now.toISOString(), candidates: collection.candidates });
    await writeJson(paths.concepts, result);
    if (await readJson(paths.performance, null) === null) {
      await writeJson(paths.performance, { updated_at: null, accounts: {}, note: "Insights 표본이 충분해지기 전에는 performance_potential=50을 사용합니다." });
    }
    await appendRadarLog(config, "completed", {
      source_count: new Set(collection.candidates.map(item => item.source)).size,
      raw_candidate_count: collection.candidates.length,
      concept_count: analysis.clusterCount,
      duplicate_count: analysis.duplicateCount,
      top_concept: analysis.concepts[0]?.title,
      errors: collection.errors
    }, now);
    return result;
  } catch (error) {
    await appendRadarLog(config, "fallback", { account_name: accountName, reason: error.message }, now);
    if (allowStaleFallback) {
      const cached = await loadCachedConcepts(config);
      if (cached?.concepts?.length) return { ...cached, cache_hit: true, stale_fallback: true, fallback_reason: error.message };
    }
    throw error;
  }
}

async function getBestTrendForAccount(accountName, options = {}) {
  try {
    const result = await runTrendRadar({ accountName, ...options });
    const accountFitKey = String(accountName).toLowerCase() === "hamnimi" ? "hamster_fit_score" : String(accountName).toLowerCase() === "cat" ? "cat_fit_score" : "dog_fit_score";
    const rescored = result.concepts
      .map(concept => {
        const accountFit = concept[accountFitKey] ?? concept.account_fit;
        const scores = { ...concept, account_fit: accountFit };
        return { ...scores, total_score: calculateTotalScore(scores, (options.config || configDefaults).weights) };
      })
      .sort((a, b) => b.total_score - a.total_score);
    const concept = rescored[0] || null;
    if (!concept) return { ok: false, fallback: true, reason: "no_valid_concept", concept: null };
    if (options.recordSelection) await recordSelection(options.config || configDefaults, { account_name: accountName, concept }, options.now || new Date());
    await appendRadarLog(options.config || configDefaults, "selected", { account_name: accountName, concept_id: concept.concept_id, concept_title: concept.title }, options.now || new Date());
    return { ok: true, fallback: false, cache_hit: result.cache_hit, stale_fallback: Boolean(result.stale_fallback), concept };
  } catch (error) {
    await appendRadarLog(options.config || configDefaults, "selection_fallback", { account_name: accountName, reason: error.message }, options.now || new Date()).catch(() => {});
    return { ok: false, fallback: true, reason: error.message, concept: null };
  }
}

async function resolveIdeaWithTrendRadar({ accountName, legacyIdea = null, radar = getBestTrendForAccount, radarOptions = {} }) {
  try {
    const trend = await radar(accountName, radarOptions);
    return trend?.ok ? { source: "trend_radar", idea: trend.concept, trend_radar: trend } : { source: "legacy", idea: legacyIdea, trend_radar: trend };
  } catch (error) {
    return { source: "legacy", idea: legacyIdea, trend_radar: { ok: false, fallback: true, reason: error.message, concept: null } };
  }
}

function printTopConcepts(result, limit = 10) {
  console.log(`TREND RADAR — ${result.generated_at.slice(0, 10)}${result.cache_hit ? " (CACHE)" : ""}`);
  console.log(`Candidates ${result.candidate_count} · Concepts ${result.cluster_count} · Duplicates ${result.duplicate_count}\n`);
  result.concepts.slice(0, limit).forEach((concept, index) => {
    console.log(`#${index + 1} ${concept.title}`);
    console.log(`Trend: ${concept.trend_score} · Pet: ${concept.pet_adaptability} · Visual: ${concept.visual_impact} · Replicable: ${concept.replicability} · Fit: ${concept.account_fit} · Novelty: ${concept.novelty}`);
    console.log(`TOTAL: ${concept.total_score}`);
    console.log(`WHY NOW: ${concept.why_trending}`);
    console.log(`PET ADAPTATION: ${concept.dog_adaptation}`);
    console.log(`HAMSTER ADAPTATION: ${concept.hamster_adaptation}`);
    console.log("--------------------------------");
  });
}

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const fixturePath = option("--input");
  const fixture = fixturePath ? JSON.parse(await readFile(resolve(fixturePath), "utf8")) : null;
  const result = await runTrendRadar({
    accountName: option("--account", "kongi"),
    forceRefresh: process.argv.includes("--refresh") || Boolean(fixture),
    inputCandidates: fixture?.candidates || fixture
  });
  printTopConcepts(result, Number(option("--limit", 10)));
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
  getBestTrendForAccount,
  printTopConcepts,
  publicConcept,
  resolveIdeaWithTrendRadar,
  runTrendRadar,
  uniqueCandidates,
  withinDays
};
