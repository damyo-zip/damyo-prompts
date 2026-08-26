import { readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = process.cwd();
const conceptsPath = join(projectRoot, "automation", "data", "trend_concepts.json");
const shadowPath = join(projectRoot, "automation", "data", "trend_shadow_history.json");

try {
  const [radar, history] = await Promise.all([
    readFile(conceptsPath, "utf8").then(JSON.parse),
    readFile(shadowPath, "utf8").then(JSON.parse)
  ]);
  const latestFor = account => [...(history.runs || [])].reverse().find(item => item.account === account) || null;
  process.stdout.write(JSON.stringify({
    radar: {
      candidates: radar.candidate_count,
      concepts: radar.cluster_count,
      publishable: radar.publishable_count,
      watchlist: radar.watchlist_count,
      errors: Array.isArray(radar.errors) ? radar.errors : []
    },
    shadows: {
      kongi: latestFor("kongi"),
      hamnimi: latestFor("hamnimi")
    }
  }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
