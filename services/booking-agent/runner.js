// Runner for a separate Node process or a Vercel Sandbox.
// Run directly with: node services/booking-agent/runner.js

import { runWorker, startWorkerLoop } from "./worker.js";

export { runWorker as runBookingAgent, startWorkerLoop };

const isMain = process.argv[1] && process.argv[1].endsWith("runner.js");
if (isMain) {
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  process.on("SIGTERM", () => controller.abort());
  const once = process.argv.includes("--once");
  if (once) {
    runWorker({ log: (m) => console.log(`[booking-agent] ${m}`) })
      .then((res) => console.log("[booking-agent] done:", JSON.stringify(res)))
      .catch((err) => { console.error("[booking-agent] failed:", err?.message || err); process.exit(1); });
  } else {
    startWorkerLoop({ signal: controller.signal });
  }
}
