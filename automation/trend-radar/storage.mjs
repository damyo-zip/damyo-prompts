import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function appendRadarLog(config, stage, details = {}, now = new Date()) {
  await mkdir(config.logDir, { recursive: true });
  const entry = { timestamp: now.toISOString(), stage, ...details };
  await appendFile(join(config.logDir, `${now.toISOString().slice(0, 10)}.jsonl`), `${JSON.stringify(entry)}\n`, "utf8");
}

function dataPaths(config) {
  return {
    candidates: join(config.dataDir, "trend_candidates.json"),
    concepts: join(config.dataDir, "trend_concepts.json"),
    history: join(config.dataDir, "trend_history.json"),
    performance: join(config.dataDir, "account_performance.json")
  };
}

async function cacheIsFresh(config, now = new Date()) {
  const paths = dataPaths(config);
  const cached = await readJson(paths.concepts, null);
  if (cached?.schema_version !== 2 || !cached?.generated_at || !Array.isArray(cached.concepts) || !cached.concepts.length) return false;
  const ageHours = (now.getTime() - new Date(cached.generated_at).getTime()) / 3_600_000;
  return ageHours >= 0 && ageHours < config.cacheTtlHours;
}

async function loadCachedConcepts(config) {
  return readJson(dataPaths(config).concepts, null);
}

async function loadPostHistory(config, now = new Date()) {
  const cutoff = now.getTime() - config.recentPostDays * 86_400_000;
  const items = [];
  async function visit(directory) {
    let entries = [];
    try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        const value = await readJson(path, null);
        if (!value) continue;
        const published = new Date(value.published_at || value.created_at || value.updated_at || 0).getTime();
        if (!published || published >= cutoff) items.push(value);
      }
    }
  }
  await visit(config.postsDir);
  const unique = [...new Map(items.map(item => [item.post_id || `${item.title}:${item.idea_summary}`, item])).values()];
  return unique.slice(-config.recentPostLimit);
}

async function loadTrendHistory(config) {
  const value = await loadTrendHistoryData(config);
  return Array.isArray(value?.selections) ? value.selections : [];
}

async function loadTrendHistoryData(config) {
  const value = await readJson(dataPaths(config).history, { selections: [], snapshots: [] });
  return {
    updated_at: value?.updated_at || null,
    selections: Array.isArray(value?.selections) ? value.selections : [],
    snapshots: Array.isArray(value?.snapshots) ? value.snapshots : []
  };
}

async function loadPerformanceScores(config, accountName) {
  const value = await readJson(dataPaths(config).performance, null);
  const account = value?.accounts?.[accountName] || {};
  return {
    defaultScore: Number.isFinite(account.default_score) ? account.default_score : 50,
    concepts: account.concepts && typeof account.concepts === "object" ? account.concepts : {}
  };
}

async function recordSelection(config, selection, now = new Date()) {
  const paths = dataPaths(config);
  const history = await loadTrendHistoryData(config);
  history.selections.push({ selected_at: now.toISOString(), account_name: selection.account_name, concept_id: selection.concept.concept_id, concept_title: selection.concept.title });
  await writeJson(paths.history, { ...history, updated_at: now.toISOString(), selections: history.selections.slice(-200) });
}

async function recordRadarSnapshot(config, concepts, now = new Date()) {
  const paths = dataPaths(config);
  const history = await loadTrendHistoryData(config);
  history.snapshots.push({
    captured_at: now.toISOString(),
    concepts: concepts.map(concept => ({
      concept_id: concept.concept_id,
      original_trend: concept.original_trend,
      source_count: concept.source_count,
      independent_source_count: concept.independent_source_count,
      recent_source_count_7d: concept.recent_source_count_7d,
      cross_platform_count: concept.cross_platform_count,
      evidence_strength: concept.evidence_strength
    }))
  });
  await writeJson(paths.history, { ...history, updated_at: now.toISOString(), snapshots: history.snapshots.slice(-120) });
}

export { appendRadarLog, cacheIsFresh, dataPaths, loadCachedConcepts, loadPerformanceScores, loadPostHistory, loadTrendHistory, loadTrendHistoryData, readJson, recordRadarSnapshot, recordSelection, writeJson };
