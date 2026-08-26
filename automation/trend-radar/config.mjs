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
  requestTimeoutMs: Number(process.env.TREND_RADAR_REQUEST_TIMEOUT_MS || 8_000),
  dataDir: join(automationDir, "data"),
  logDir: join(automationDir, "logs", "trend-radar"),
  postsDir: join(automationDir, "posts"),
  weights: {
    trend_score: 0.20,
    pet_adaptability: 0.25,
    visual_impact: 0.20,
    replicability: 0.15,
    account_fit: 0.10,
    novelty: 0.10,
    performance_potential: 0
  }
};

export default config;
