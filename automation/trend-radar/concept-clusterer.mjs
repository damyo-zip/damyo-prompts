import { analyzeCandidate } from "./analyzer.mjs";

function clusterCandidates(candidates, analyzer = analyzeCandidate) {
  const clusters = new Map();
  for (const candidate of candidates) {
    const analyzed = analyzer(candidate);
    if (!analyzed) continue;
    const existing = clusters.get(analyzed.concept_key);
    if (existing) existing.candidates.push(candidate);
    else clusters.set(analyzed.concept_key, analyzed);
  }
  return [...clusters.values()].map(cluster => {
    const orderedDates = cluster.candidates
      .map(item => item.published_at)
      .filter(Boolean)
      .sort();
    const sourceUrls = [...new Set(cluster.candidates.map(item => item.source_url).filter(Boolean))];
    const sources = [...new Set(cluster.candidates.map(item => item.source).filter(Boolean))];
    return {
      ...cluster,
      source_urls: sourceUrls,
      sources,
      source_count: sources.length,
      first_seen_at: orderedDates[0] || null,
      last_seen_at: orderedDates.at(-1) || null
    };
  });
}

export { clusterCandidates };
