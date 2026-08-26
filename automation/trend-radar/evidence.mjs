import { semanticSimilarity } from "./dedupe.mjs";

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function hostname(value = "") {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function normalizedPublisher(candidate) {
  const domain = String(candidate.domain || hostname(candidate.source_url)).replace(/^www\./, "");
  if (domain && domain !== "news.google.com") return domain;
  return String(candidate.source || domain || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferPlatform(candidate) {
  const text = `${candidate.source} ${candidate.title} ${candidate.description} ${candidate.source_url}`.toLowerCase();
  if (/reddit|r\/[a-z0-9_]+/.test(text)) return "reddit";
  if (/pinterest/.test(text)) return "pinterest";
  if (/tiktok/.test(text)) return "tiktok";
  if (/instagram|\breels?\b/.test(text)) return "instagram";
  if (/knowyourmeme|\bmeme\b/.test(text)) return "meme_database";
  if (/vogue|fashion|editorial|glamour|cosmopolitan/.test(text)) return "fashion_editorial";
  return candidate.platform && candidate.platform !== "web" ? candidate.platform : candidate.source_type || "web";
}

function sourceQuality(candidate, config) {
  const domain = String(candidate.domain || hostname(candidate.source_url)).replace(/^www\./, "");
  const override = config.sourceQualityDomains?.[domain];
  if (Number.isFinite(override)) return Number(override);
  return Number(config.sourceQuality?.[candidate.source_type] ?? config.sourceQuality?.unknown ?? 0.4);
}

function compactSignalSummary(candidate) {
  const description = String(candidate.description || "").replace(/\s+/g, " ").trim();
  const excerpt = description && description.toLowerCase() !== String(candidate.title || "").toLowerCase()
    ? description.slice(0, 180)
    : "";
  return [candidate.title, excerpt].filter(Boolean).join(" — ");
}

function normalizedPublishedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function makeSourceEvidence(candidate, config) {
  return {
    source_name: candidate.source || "unknown",
    source_type: candidate.source_type || "unknown",
    platform: inferPlatform(candidate),
    domain: candidate.domain || hostname(candidate.source_url),
    url: candidate.source_url || "",
    title: candidate.title || "",
    published_at: normalizedPublishedAt(candidate.published_at),
    date_status: normalizedPublishedAt(candidate.published_at) ? "known" : "unknown",
    source_quality: Number(sourceQuality(candidate, config).toFixed(2)),
    signal_summary: compactSignalSummary(candidate),
    publisher_key: normalizedPublisher(candidate),
    is_independent: false,
    independent_group: null
  };
}

function deduplicateIndependentSources(sourceEvidence, config) {
  const threshold = config.evidence.independentTitleSimilarity;
  const ordered = [...sourceEvidence].sort((left, right) => {
    if (right.source_quality !== left.source_quality) return right.source_quality - left.source_quality;
    return String(right.published_at || "").localeCompare(String(left.published_at || ""));
  });
  const groups = [];
  for (const evidence of ordered) {
    const group = groups.find(item =>
      item.publisher_key === evidence.publisher_key ||
      semanticSimilarity(item.title, evidence.title) >= threshold
    );
    if (group) {
      evidence.independent_group = group.id;
      group.members.push(evidence);
      continue;
    }
    const created = {
      id: `source-group-${String(groups.length + 1).padStart(2, "0")}`,
      publisher_key: evidence.publisher_key,
      title: evidence.title,
      representative: evidence,
      members: [evidence]
    };
    evidence.independent_group = created.id;
    evidence.is_independent = true;
    groups.push(created);
  }
  return { evidence: sourceEvidence, groups };
}

function ageDays(value, now) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function freshnessScore(latestSourceDate, now) {
  const age = ageDays(latestSourceDate, now);
  if (age == null) return 0;
  if (age <= 1) return 100;
  if (age <= 3) return 90;
  if (age <= 7) return 80;
  if (age <= 14) return 60;
  if (age <= 30) return 40;
  return 0;
}

function normalizedCount(value, target) {
  return clamp((Number(value) / Math.max(1, Number(target))) * 100);
}

function calculateEvidenceStrength(metrics, config, now = new Date()) {
  const weights = config.evidence.weights;
  const targets = config.evidence.normalization;
  const components = {
    independent_sources: normalizedCount(metrics.independent_source_count, targets.independentSourcesTarget),
    recent_7d: normalizedCount(metrics.recent_source_count_7d, targets.recent7dTarget),
    recent_30d: normalizedCount(metrics.recent_source_count_30d, targets.recent30dTarget),
    cross_platform: normalizedCount(metrics.cross_platform_count, targets.crossPlatformTarget),
    source_quality: clamp(metrics.average_source_quality * 100),
    freshness: freshnessScore(metrics.latest_source_date, now)
  };
  const weightTotal = Object.values(weights).reduce((sum, value) => sum + Number(value), 0) || 1;
  const score = Object.entries(weights).reduce((sum, [key, weight]) => sum + (components[key] || 0) * Number(weight), 0) / weightTotal;
  return { evidence_strength: clamp(score), evidence_components: components };
}

function isWeakSignal(metrics, config) {
  const minimum = config.evidence.minimum;
  return !(
    metrics.independent_source_count >= minimum.independentSourceCount ||
    metrics.recent_source_count_7d >= minimum.recentSourceCount7d ||
    metrics.cross_platform_count >= minimum.crossPlatformCount
  );
}

function calculateTrendMomentum(concept, historyData = {}, now = new Date(), minimumHours = 6) {
  const snapshots = Array.isArray(historyData.snapshots) ? historyData.snapshots : [];
  const previousSnapshot = [...snapshots]
    .filter(snapshot => now.getTime() - new Date(snapshot.captured_at).getTime() >= minimumHours * 3_600_000)
    .sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)))[0];
  if (!previousSnapshot) return "unknown";
  const previous = (previousSnapshot.concepts || []).find(item => item.concept_id === concept.concept_id);
  if (!previous) return "new";
  const before = Number(previous.independent_source_count ?? previous.source_count ?? 0);
  const current = Number(concept.independent_source_count ?? concept.source_count ?? 0);
  if (current - before >= 2 && current >= before * 1.5) return "rising";
  if (before - current >= 2 && current <= before * 0.6) return "declining";
  return "stable";
}

function validateOriginalTrendGrounding(concept) {
  if (!concept?.original_trend || !concept?.pet_adaptation || concept.original_trend === concept.pet_adaptation) return false;
  const candidateUrls = new Set((concept.candidates || []).map(item => item.source_url).filter(Boolean));
  const groundedUrls = (concept.grounded_candidate_urls || []).filter(url => candidateUrls.has(url));
  return groundedUrls.length > 0 && (concept.grounding_patterns || []).length > 0;
}

function validateTrendEvidence(concept, { config, now = new Date(), historyData = {} }) {
  if (!validateOriginalTrendGrounding(concept)) {
    return { valid: false, reason: "original_trend_not_grounded", concept };
  }
  const rawEvidence = (concept.candidates || []).map(candidate => makeSourceEvidence(candidate, config));
  const { evidence, groups } = deduplicateIndependentSources(rawEvidence, config);
  const independent = groups.map(group => group.representative);
  const knownDates = evidence.map(item => item.published_at).filter(Boolean).sort();
  const metrics = {
    source_count: evidence.length,
    independent_source_count: independent.length,
    recent_source_count_7d: independent.filter(item => {
      const age = ageDays(item.published_at, now);
      return age != null && age <= 7;
    }).length,
    recent_source_count_30d: independent.filter(item => {
      const age = ageDays(item.published_at, now);
      return age != null && age <= 30;
    }).length,
    cross_platform_count: new Set(independent.map(item => item.platform).filter(Boolean)).size,
    latest_source_date: knownDates.at(-1) || null,
    average_source_quality: independent.length
      ? independent.reduce((sum, item) => sum + item.source_quality, 0) / independent.length
      : 0
  };
  const evidenceScore = calculateEvidenceStrength(metrics, config, now);
  const enriched = {
    ...concept,
    ...metrics,
    ...evidenceScore,
    source_evidence: evidence.sort((left, right) => String(right.published_at || "").localeCompare(String(left.published_at || ""))),
    weak_signal: isWeakSignal(metrics, config)
  };
  enriched.trend_momentum = calculateTrendMomentum(enriched, historyData, now, config.evidence.momentumMinimumHours);
  enriched.why_trending_evidence = [
    `${metrics.independent_source_count} independent source${metrics.independent_source_count === 1 ? "" : "s"} after publisher and syndication deduplication`,
    `${metrics.recent_source_count_7d} dated signal${metrics.recent_source_count_7d === 1 ? "" : "s"} in 7d; ${metrics.recent_source_count_30d} in 30d`,
    `${metrics.cross_platform_count} platform/source-type channel${metrics.cross_platform_count === 1 ? "" : "s"}`,
    metrics.latest_source_date ? `latest dated signal ${metrics.latest_source_date.slice(0, 10)}` : "no verifiable publication date"
  ];
  return { valid: true, concept: enriched };
}

export {
  calculateEvidenceStrength,
  calculateTrendMomentum,
  deduplicateIndependentSources,
  inferPlatform,
  isWeakSignal,
  makeSourceEvidence,
  normalizedPublisher,
  sourceQuality,
  validateOriginalTrendGrounding,
  validateTrendEvidence
};
