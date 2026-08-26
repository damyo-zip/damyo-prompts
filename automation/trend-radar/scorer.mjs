function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function daysOld(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 30;
  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function applyEvidenceCap(rawTrendScore, evidenceStrength, trendScoreCaps = []) {
  const cap = trendScoreCaps.find(item => Number(evidenceStrength) < Number(item.below));
  return clamp(cap ? Math.min(rawTrendScore, cap.max) : rawTrendScore);
}

function calculateTrendScore(concept, now = new Date(), evidenceConfig = {}) {
  const age = daysOld(concept.last_seen_at, now);
  const recency = age <= 2 ? 35 : age <= 7 ? 31 : age <= 14 ? 23 : age <= 30 ? 14 : 4;
  const independentSources = Math.min(25, Number(concept.independent_source_count || 0) * 5);
  const recentSignals = Math.min(20, Number(concept.recent_source_count_7d || 0) * 5);
  const crossPlatform = Math.min(10, Number(concept.cross_platform_count || 0) * 4);
  const repetition = Math.min(10, Number(concept.source_count || concept.candidates?.length || 0) * 2);
  const raw = clamp(recency + independentSources + recentSignals + crossPlatform + repetition);
  return applyEvidenceCap(raw, concept.evidence_strength || 0, evidenceConfig.trendScoreCaps || []);
}

function calculateTotalScore(scores, weights) {
  const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (!totalWeight) return 0;
  const weighted = entries.reduce((sum, [key, weight]) => sum + clamp(scores[key]) * Number(weight), 0);
  return Number((weighted / totalWeight).toFixed(1));
}

function scoreConcept(concept, { weights, evidenceConfig = {}, now = new Date(), performancePotential = 50 } = {}) {
  const scores = {
    trend_score: calculateTrendScore(concept, now, evidenceConfig),
    evidence_strength: clamp(concept.evidence_strength || 0),
    pet_adaptability: clamp(concept.baseline_scores.pet_adaptability),
    visual_impact: clamp(concept.baseline_scores.visual_impact),
    replicability: clamp(concept.baseline_scores.replicability),
    account_fit: clamp(concept.account_fit ?? concept.baseline_scores.account_fit),
    novelty: clamp(concept.novelty ?? 100),
    performance_potential: clamp(performancePotential)
  };
  const rawTotalScore = calculateTotalScore(scores, weights);
  const weakPenalty = concept.weak_signal ? Number(evidenceConfig.weakSignalPenalty || 0) : 0;
  return {
    ...concept,
    ...scores,
    raw_total_score: rawTotalScore,
    weak_signal_penalty: weakPenalty,
    total_score: Number(Math.max(0, rawTotalScore - weakPenalty).toFixed(1))
  };
}

export { applyEvidenceCap, calculateTotalScore, calculateTrendScore, clamp, daysOld, scoreConcept };
