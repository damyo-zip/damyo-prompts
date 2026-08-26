import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const trendRadarDir = dirname(fileURLToPath(import.meta.url));
const automationDir = dirname(trendRadarDir);

const config = {
  cacheTtlHours: Number(process.env.TREND_RADAR_CACHE_TTL_HOURS || 12),
  recentWindowDays: 7,
  extendedWindowDays: 30,
  recentPostLimit: 30,
  recentPostDays: 60,
  minimumConcepts: 10,
  maximumConcepts: 30,
  publishable: {
    minEvidence: Number(process.env.PUBLISHABLE_MIN_EVIDENCE || 50)
  },
  watchlist: {
    minEvidence: 20,
    minTotalScore: 40
  },
  shadow: {
    retentionDays: 90,
    maxRuns: 500,
    topConceptLimit: 10
  },
  requestTimeoutMs: Number(process.env.TREND_RADAR_REQUEST_TIMEOUT_MS || 8_000),
  dataDir: join(automationDir, "data"),
  logDir: join(automationDir, "logs", "trend-radar"),
  postsDir: join(automationDir, "posts"),
  weights: {
    trend_score: 0.15,
    evidence_strength: 0.15,
    pet_adaptability: 0.20,
    visual_impact: 0.20,
    replicability: 0.10,
    account_fit: 0.10,
    novelty: 0.10,
    performance_potential: 0
  },
  evidence: {
    independentTitleSimilarity: 0.82,
    momentumMinimumHours: 6,
    minimum: {
      independentSourceCount: 2,
      recentSourceCount7d: 2,
      crossPlatformCount: 2
    },
    weakSignalPenalty: 18,
    weights: {
      independent_sources: 0.25,
      recent_7d: 0.25,
      recent_30d: 0.10,
      cross_platform: 0.20,
      source_quality: 0.10,
      freshness: 0.10
    },
    normalization: {
      independentSourcesTarget: 5,
      recent7dTarget: 4,
      recent30dTarget: 6,
      crossPlatformTarget: 3
    },
    trendScoreCaps: [
      { below: 30, max: 50 },
      { below: 50, max: 70 },
      { below: 70, max: 85 }
    ]
  },
  sourceQuality: {
    official_report: 0.95,
    professional_media: 0.88,
    trend_tracker: 0.82,
    meme_database: 0.74,
    community_discussion: 0.62,
    news_article: 0.72,
    news_aggregation: 0.52,
    seo_blog: 0.35,
    unknown: 0.40
  },
  sourceQualityDomains: {
    "business.pinterest.com": 0.97,
    "newsroom.pinterest.com": 0.97,
    "vogue.com": 0.92,
    "later.com": 0.86,
    "newengen.com": 0.84,
    "lightreel.ai": 0.76,
    "knowyourmeme.com": 0.76,
    "reddit.com": 0.62
  }
};

export default config;
