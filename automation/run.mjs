import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getAccount } from "./accounts/index.mjs";
import { runInsightsCollector } from "./insights-collector.mjs";
import { runForAccount } from "./kongi.mjs";

async function main() {
  const first = process.argv[2] || "inspect";
  const explicitSecond = process.argv[3];
  if (first === "insights" && !explicitSecond) {
    const result = await runInsightsCollector();
    console.log(JSON.stringify(result, null, 2));
    if (result.totals.errors) process.exitCode = 1;
    return;
  }
  const second = explicitSecond || "kongi";
  const firstIsAccount = ["kongi", "hamnimi"].includes(first);
  const accountKey = firstIsAccount ? first : second;
  const command = firstIsAccount ? second : first;
  await runForAccount(getAccount(accountKey), command);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
