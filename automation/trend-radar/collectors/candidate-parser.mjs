function decodeEntities(value = "") {
  const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordsFromText(value = "") {
  const stop = new Set(["about", "after", "before", "from", "have", "into", "that", "their", "this", "trend", "trends", "viral", "with", "your"]);
  return [...new Set(String(value).toLowerCase().match(/[a-z0-9가-힣][a-z0-9가-힣-]{2,}/g) || [])]
    .filter(word => !stop.has(word))
    .slice(0, 20);
}

function normalizeCandidate(input, now = new Date()) {
  const title = decodeEntities(input.title);
  const description = decodeEntities(input.description || "");
  const published = new Date(input.published_at || input.publishedAt || now);
  return {
    source: String(input.source || "unknown").trim(),
    source_url: String(input.source_url || input.url || "").trim(),
    title,
    description,
    published_at: Number.isNaN(published.getTime()) ? null : published.toISOString(),
    collected_at: now.toISOString(),
    keywords: Array.isArray(input.keywords) && input.keywords.length
      ? [...new Set(input.keywords.map(value => String(value).toLowerCase()))]
      : keywordsFromText(`${title} ${description}`)
  };
}

function parseRss(xml, { source = "Google News", now = new Date() } = {}) {
  const items = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return items.map(item => {
    const read = tag => decodeEntities(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
    const rawTitle = read("title");
    const sourceMatch = rawTitle.match(/\s+-\s+([^-]+)$/);
    return normalizeCandidate({
      source: sourceMatch?.[1]?.trim() || source,
      source_url: read("link"),
      title: sourceMatch ? rawTitle.slice(0, sourceMatch.index).trim() : rawTitle,
      description: read("description"),
      published_at: read("pubDate")
    }, now);
  }).filter(candidate => candidate.title && candidate.source_url);
}

export { decodeEntities, keywordsFromText, normalizeCandidate, parseRss };
