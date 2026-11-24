// Node entry for the booking agent.
// Exports runWorker (single claim) and startWorkerLoop (continuous polling daemon).

import { runNext } from "../../lib/bookingAgent/run.js";
import { launchHonestChromium, launchBrowserbaseSession } from "./browser.js";
import { createBookingAgentStore } from "../../lib/bookingAgent/repository.js";
import { reserveConfiguration, createReserveRepository } from "../../lib/reserveRepository.js";

export async function runWorker(deps = {}) {
  const env = deps.env || process.env;
  let config = deps.config || null;
  if (!deps.store && !config) config = reserveConfiguration(env);
  const fetchImpl = deps.fetchImpl;
  const repository = deps.repository || (config ? createReserveRepository(config, fetchImpl) : null);
  const store = deps.store || createBookingAgentStore(config, fetchImpl);
  const defaultLaunch = (opts) => {
    const mode = opts.mode || env.BOOKING_AGENT_BROWSER_MODE;
    if (mode === "browserbase") return launchBrowserbaseSession({ ...opts, env, fetchImpl });
    return launchHonestChromium({ ...opts, mode });
  };
  return runNext({
    env,
    store,
    now: deps.now,
    launch: deps.launch || defaultLaunch,
    loadProfile: deps.loadProfile || (repository ? (userId) => repository.readBookingProfile(userId) : async () => null),
    placeName: deps.placeName || (repository ? async (id) => (await repository.getInventoryPlace(id))?.name || null : async () => null),
    log: deps.log || (() => {}),
    stepTimeoutMs: deps.stepTimeoutMs,
    runTimeoutMs: deps.runTimeoutMs,
    smsTimeoutMs: deps.smsTimeoutMs,
    smsPollMs: deps.smsPollMs,
    liveViewTimeoutMs: deps.liveViewTimeoutMs,
    liveViewPollMs: deps.liveViewPollMs,
    fetchImpl,
    selectors: deps.selectors,
  });
}

export async function startWorkerLoop(opts = {}) {
  const pollMs = Math.max(1000, Number(opts.pollMs || process.env.BOOKING_AGENT_POLL_MS || 3000));
  const log = opts.log || ((msg) => console.log(`[booking-agent] ${msg}`));
  let stopped = false;
  const stop = () => { stopped = true; };
  if (opts.signal) opts.signal.addEventListener("abort", stop, { once: true });
  log(`worker loop started (poll=${pollMs}ms)`);
  while (!stopped) {
    try {
      const res = await runWorker({ ...opts, log });
      if (res && res.ran) log(`run ${res.id} -> ${res.status}`);
    } catch (err) {
      log(`poll error: ${err && err.code ? err.code : "unknown"}`);
    }
    if (!stopped) await new Promise((r) => setTimeout(r, pollMs));
  }
  log("worker loop stopped");
}
