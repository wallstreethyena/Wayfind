// Node entry for the booking agent. Not started by any deploy, cron, or Vercel project.
// A Vercel Sandbox would call runNext with the same arguments. Neither host is configured here.

import { runNext } from "../../lib/bookingAgent/run.js";
import { launchHonestChromium } from "./browser.js";
import { createBookingAgentStore } from "../../lib/bookingAgent/repository.js";
import { reserveConfiguration, createReserveRepository } from "../../lib/reserveRepository.js";

export async function runWorker(deps = {}) {
  const env = deps.env || process.env;
  let config = deps.config || null;
  if (!deps.store && !config) config = reserveConfiguration(env);
  const fetchImpl = deps.fetchImpl;
  const repository = deps.repository || (config ? createReserveRepository(config, fetchImpl) : null);
  const store = deps.store || createBookingAgentStore(config, fetchImpl);
  return runNext({
    env,
    store,
    now: deps.now,
    launch: deps.launch || ((opts) => launchHonestChromium(opts)),
    loadProfile: deps.loadProfile || (repository ? (userId) => repository.readBookingProfile(userId) : async () => null),
    placeName: deps.placeName || (repository ? async (id) => (await repository.getInventoryPlace(id))?.name || null : async () => null),
    log: deps.log || (() => {}),
    stepTimeoutMs: deps.stepTimeoutMs,
    runTimeoutMs: deps.runTimeoutMs,
    fetchImpl,
    selectors: deps.selectors,
  });
}
