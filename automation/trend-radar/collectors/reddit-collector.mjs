import { redditCommunities } from "./source-config.mjs";
import { normalizeCandidate, parseRss } from "./candidate-parser.mjs";

async function collectReddit({ config, fetchImpl = fetch, now = new Date(), communities = redditCommunities } = {}) {
  const settled = await Promise.allSettled(communities.map(async community => {
    const url = `https://www.reddit.com/r/${encodeURIComponent(community)}/top.json?t=week&limit=25&raw_json=1`;
    const requestOptions = {
      headers: { "user-agent": "damyo-trend-radar/1.0 (public research)" },
      signal: AbortSignal.timeout(config.requestTimeoutMs)
    };
    const response = await fetchImpl(url, requestOptions);
    if (!response.ok) {
      const rssUrl = `https://www.reddit.com/r/${encodeURIComponent(community)}/top/.rss?t=week`;
      const rssResponse = await fetchImpl(rssUrl, { ...requestOptions, signal: AbortSignal.timeout(config.requestTimeoutMs) });
      if (!rssResponse.ok) throw new Error(`Reddit r/${community} HTTP ${response.status}/${rssResponse.status}`);
      return parseRss(await rssResponse.text(), { source: `Reddit r/${community}`, now });
    }
    const json = await response.json();
    return (json?.data?.children || []).map(({ data }) => normalizeCandidate({
      source: `Reddit r/${community}`,
      source_url: `https://www.reddit.com${data.permalink}`,
      title: data.title,
      description: data.selftext || `Reddit score ${data.score || 0}; ${data.num_comments || 0} comments`,
      published_at: new Date(Number(data.created_utc) * 1000),
      keywords: [...(data.link_flair_text ? [data.link_flair_text] : []), ...(data.title?.toLowerCase().match(/[a-z0-9가-힣-]{3,}/g) || [])]
    }, now));
  }));
  return {
    candidates: settled.flatMap(result => result.status === "fulfilled" ? result.value : []),
    errors: settled.filter(result => result.status === "rejected").map(result => result.reason.message)
  };
}

export { collectReddit };
