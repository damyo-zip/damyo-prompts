import { editorialPages, searchQueries } from "./source-config.mjs";
import { decodeEntities, normalizeCandidate, parseRss } from "./candidate-parser.mjs";

async function fetchText(url, { timeoutMs, fetchImpl = fetch, headers = {} }) {
  const response = await fetchImpl(url, {
    headers: { "user-agent": "damyo-trend-radar/1.0 (+public trend research)", ...headers },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

function metaContent(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i")
  ];
  return patterns.map(pattern => html.match(pattern)?.[1]).find(Boolean) || "";
}

function articleText(html) {
  const jsonBody = html.match(/["']articleBody["']\s*:\s*["']([\s\S]*?)(?<!\\)["']\s*[,}]/i)?.[1];
  const body = jsonBody || html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || "";
  return decodeEntities(body
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/\\n|\\r|\\t/g, " ")
    .replace(/\\"/g, '"'))
    .slice(0, 20_000);
}

async function collectSearchResults({ config, fetchImpl = fetch, now = new Date(), queries = searchQueries } = {}) {
  const settled = await Promise.allSettled(queries.map(async query => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${config.recentWindowDays}d`)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await fetchText(url, { timeoutMs: config.requestTimeoutMs, fetchImpl });
    return parseRss(xml, { source: "Google News", now });
  }));
  const candidates = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const errors = settled.filter(result => result.status === "rejected").map(result => result.reason.message);
  return { candidates, errors };
}

async function collectEditorialPages({ config, fetchImpl = fetch, now = new Date(), pages = editorialPages } = {}) {
  const settled = await Promise.allSettled(pages.map(async url => {
    const html = await fetchText(url, { timeoutMs: config.requestTimeoutMs, fetchImpl });
    const title = metaContent(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url;
    const description = [metaContent(html, "og:description") || metaContent(html, "description"), articleText(html)].filter(Boolean).join(" ");
    const publishedAt = metaContent(html, "article:published_time") || metaContent(html, "datePublished") || now.toISOString();
    return normalizeCandidate({ source: new URL(url).hostname, source_url: url, title, description, published_at: publishedAt }, now);
  }));
  return {
    candidates: settled.filter(result => result.status === "fulfilled").map(result => result.value),
    errors: settled.filter(result => result.status === "rejected").map(result => result.reason.message)
  };
}

export { articleText, collectEditorialPages, collectSearchResults, fetchText, metaContent };
