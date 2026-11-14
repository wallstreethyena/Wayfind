// Next.js instrumentation hook (server + edge). register() runs once per
// runtime at startup and initialises Sentry there. The CLIENT is intentionally
// NOT initialised here — it loads lazily, after hydration, from
// app/components/SentryClient.js, so the browser SDK never counts toward
// first-load JS (the 325KB bundle ceiling stays enforced).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // One retry for the idle keep-alive "other side closed" race (lib/serverDispatcher.js).
    // Server only: imported dynamically here, never reachable from client code.
    try {
      const { installResilientDispatcher } = await import("./lib/serverDispatcher");
      installResilientDispatcher();
    } catch (err) {
      console.error("[instrumentation] serverDispatcher import failed:", err && err.message);
    }
    try {
      const { installProductionWriteFetchGuard } = await import("./lib/productionWriteFirewall.js");
      installProductionWriteFetchGuard();
    } catch (err) {
      console.error("[instrumentation] productionWriteFirewall import failed:", err && err.message);
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Next 15+ calls this for every server error; harmless (unused) on 14.
export const onRequestError = Sentry.captureRequestError;
