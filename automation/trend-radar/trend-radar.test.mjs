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
import { getBestTrendForAccount, resolveIdeaWithTrendRadar, runTrendRadar } from "./runner.mjs";
import { calculateTotalScore, scoreConcept } from "./scorer.mjs";
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
  const concept = adaptConcept(clusterCandidates([candidate("Paparazzi trend")])[0], "kongi");
  const scored = scoreConcept({ ...concept, novelty: 90 }, { weights: defaults.weights, now: fixedNow });
  assert.ok(scored.total_score >= 80 && scored.total_score <= 100);
  assert.equal(scored.account_fit, scored.dog_fit_score);
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
  await runTrendRadar({ config, now: fixedNow, forceRefresh: true, inputCandidates: [candidate("Paparazzi trend")] });
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
