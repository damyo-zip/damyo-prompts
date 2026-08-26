import { dataPaths, readJson, writeJson } from "./storage.mjs";

function conceptSnapshot(concept) {
  return {
    concept_id: concept.concept_id,
    title: concept.title,
    total_score: concept.total_score,
    evidence_strength: concept.evidence_strength,
    trend_momentum: concept.trend_momentum,
    publishable: concept.publishable,
    watchlist_reasons: concept.watchlist_reasons || []
  };
}

function findConceptSnapshot(run, conceptId) {
  return [...(run.top_publishable || []), ...(run.watchlist || [])]
    .find(item => item.concept_id === conceptId) || null;
}

function calculateShadowChange(previous, current) {
  if (!previous || !current) return null;
  const totalFrom = Number(previous.total_score || 0);
  const totalTo = Number(current.total_score || 0);
  const evidenceFrom = Number(previous.evidence_strength || 0);
  const evidenceTo = Number(current.evidence_strength || 0);
  return {
    previous_run_at: previous.run_at || null,
    total_score: { from: totalFrom, to: totalTo, delta: Number((totalTo - totalFrom).toFixed(1)) },
    evidence_strength: { from: evidenceFrom, to: evidenceTo, delta: evidenceTo - evidenceFrom },
    momentum: { from: previous.trend_momentum || "unknown", to: current.trend_momentum || "unknown" }
  };
}

function buildShadowRun(result, account, history = { runs: [] }, now = new Date(), config = {}) {
  const limit = Number(config.shadow?.topConceptLimit || 10);
  const publishable = result.concepts.filter(concept => concept.publishable).sort((a, b) => b.total_score - a.total_score);
  const watchlist = result.concepts.filter(concept => concept.watchlist).sort((a, b) => b.total_score - a.total_score);
  const selected = publishable[0] || null;
  const previousRun = [...(history.runs || [])].reverse().find(run => {
    return run.account === account && selected && findConceptSnapshot(run, selected.concept_id);
  });
  const previousConcept = previousRun && selected ? findConceptSnapshot(previousRun, selected.concept_id) : null;
  const change = calculateShadowChange(
    previousConcept ? { ...previousConcept, run_at: previousRun.run_at } : null,
    selected
  );
  return {
    run_at: now.toISOString(),
    account,
    selected_concept_id: selected?.concept_id || null,
    selected_concept: selected?.title || null,
    total_score: selected?.total_score ?? null,
    evidence_strength: selected?.evidence_strength ?? null,
    trend_momentum: selected?.trend_momentum || null,
    publishable_count: publishable.length,
    top_publishable: publishable.slice(0, limit).map(conceptSnapshot),
    watchlist: watchlist.slice(0, limit).map(conceptSnapshot),
    change_from_previous: change
  };
}

function pruneShadowRuns(runs, config, now = new Date()) {
  const retentionDays = Number(config.shadow?.retentionDays || 90);
  const maxRuns = Number(config.shadow?.maxRuns || 500);
  const cutoff = now.getTime() - retentionDays * 86_400_000;
  return runs
    .filter(run => {
      const timestamp = new Date(run.run_at).getTime();
      return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now.getTime();
    })
    .slice(-maxRuns);
}

async function loadShadowHistory(config) {
  const value = await readJson(dataPaths(config).shadow, { schema_version: 1, updated_at: null, runs: [] });
  return {
    schema_version: 1,
    updated_at: value?.updated_at || null,
    runs: Array.isArray(value?.runs) ? value.runs : []
  };
}

async function appendShadowHistory(config, run, now = new Date()) {
  const history = await loadShadowHistory(config);
  const runs = pruneShadowRuns([...history.runs, run], config, now);
  const value = { schema_version: 1, updated_at: now.toISOString(), runs };
  await writeJson(dataPaths(config).shadow, value);
  return value;
}

export {
  appendShadowHistory,
  buildShadowRun,
  calculateShadowChange,
  conceptSnapshot,
  findConceptSnapshot,
  loadShadowHistory,
  pruneShadowRuns
};
