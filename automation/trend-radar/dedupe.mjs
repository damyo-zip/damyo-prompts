const aliases = new Map(Object.entries({
  기차: "train", 완행열차: "train", 열차: "train", 창가: "window-travel", 여행: "travel",
  디카: "digicam", 폰카: "snapshot", 스마트폰: "snapshot", 스냅: "snapshot",
  잡지: "magazine", 매거진: "magazine", 표지: "cover", 화보: "editorial",
  미니: "miniature", 미니어처: "miniature", 작은: "miniature",
  강아지: "pet", 반려견: "pet", 고양이: "pet", 햄스터: "pet", 반려동물: "pet",
  복제: "clone", 군중: "crowd", 레트로: "retro", 복고: "retro",
  nostalgia: "retro", nostalgic: "retro", photograph: "photo", photography: "photo", portrait: "photo"
}));

function semanticTokens(value = "") {
  return new Set((String(value).toLowerCase().match(/[a-z0-9가-힣][a-z0-9가-힣-]{1,}/g) || [])
    .map(token => token.replace(/(에서는|으로는|에서|으로|에게|처럼|하는|한|의|을|를|은|는|이|가)$/u, ""))
    .map(token => aliases.get(token) || token)
    .filter(token => token.length > 1));
}

function semanticSimilarity(left, right) {
  const a = semanticTokens(left);
  const b = semanticTokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(token => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  const containment = intersection / Math.min(a.size, b.size);
  const jaccard = intersection / union;
  return Math.max(jaccard, containment * 0.88);
}

function conceptText(concept) {
  return [concept.title, concept.description, concept.adaptation, ...(concept.keywords || [])].filter(Boolean).join(" ");
}

function historyText(item) {
  return [item.title, item.idea_category, item.idea_summary, item.category, item.description, item.concept_title].filter(Boolean).join(" ");
}

function noveltyAgainstHistory(concept, history = []) {
  const similarities = history.map(item => semanticSimilarity(conceptText(concept), historyText(item)));
  const maxSimilarity = similarities.length ? Math.max(...similarities) : 0;
  return { maxSimilarity, novelty: Math.max(0, Math.round(100 - maxSimilarity * 100)) };
}

function filterRecentDuplicates(concepts, history = [], threshold = 0.72) {
  const included = [];
  const excluded = [];
  for (const concept of concepts) {
    const result = noveltyAgainstHistory(concept, history);
    const enriched = { ...concept, novelty: result.novelty, duplicate_similarity: Number(result.maxSimilarity.toFixed(3)) };
    if (result.maxSimilarity >= threshold) excluded.push(enriched);
    else included.push(enriched);
  }
  return { included, excluded };
}

export { conceptText, filterRecentDuplicates, noveltyAgainstHistory, semanticSimilarity, semanticTokens };
