function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function daysOld(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 30;
  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function calculateTrendScore(concept, now = new Date()) {
  const age = daysOld(concept.last_seen_at, now);
  const recency = age <= 2 ? 50 : age <= 7 ? 44 : age <= 14 ? 34 : age <= 30 ? 22 : 8;
  const sourceDiversity = Math.min(25, Math.max(0, (concept.source_count - 1) * 7 + 7));
  const sourceText = (concept.sources || []).join(" ").toLowerCase();
  const platformSignals = ["reddit", "instagram", "tiktok", "pinterest", "meme", "vogue"].filter(signal => sourceText.includes(signal)).length;
  const crossPlatform = Math.min(15, platformSignals * 4 + (concept.source_count >= 3 ? 3 : 0));
  const repetition = Math.min(10, (concept.candidates?.length || concept.source_urls?.length || 1) * 2);
  return clamp(recency + sourceDiversity + crossPlatform + repetition);
}

function calculateTotalScore(scores, weights) {
  const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (!totalWeight) return 0;
  const weighted = entries.reduce((sum, [key, weight]) => sum + clamp(scores[key]) * Number(weight), 0);
  return Number((weighted / totalWeight).toFixed(1));
}

function scoreConcept(concept, { weights, now = new Date(), performancePotential = 50 } = {}) {
  const scores = {
    trend_score: calculateTrendScore(concept, now),
    pet_adaptability: clamp(concept.baseline_scores.pet_adaptability),
    visual_impact: clamp(concept.baseline_scores.visual_impact),
    replicability: clamp(concept.baseline_scores.replicability),
    account_fit: clamp(concept.account_fit ?? concept.baseline_scores.account_fit),
    novelty: clamp(concept.novelty ?? 100),
    performance_potential: clamp(performancePotential)
  };
  return { ...concept, ...scores, total_score: calculateTotalScore(scores, weights) };
}

export { calculateTotalScore, calculateTrendScore, clamp, daysOld, scoreConcept };
