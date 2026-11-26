// One booking agent pass inside a Vercel function (owner decision 2026-11-25: run it on
// Wayfind's own hosting, no separate worker server). Called by /api/cron/booking-agent every
// minute and right after a guest's tap, through next/server after().
//
// A run the function never finished (the platform stopped it) would hold the one-active-run
// slot forever, so stale progress rows are closed first: a run that already submitted becomes
// unknown_after_submit (the guest checks OpenTable), anything earlier becomes handback:timeout.

import { runNext } from "./run.js";
import { createBookingAgentStore } from "./repository.js";
import { launchBrowserbaseCdp } from "./cdpSession.js";
import { reserveConfiguration, createReserveRepository } from "../reserveRepository.js";
import { SITE } from "./constants.js";

// A run older than this in a progress state is not alive any more (function limit is 300 s).
export const STALE_RUN_MS = 6 * 60 * 1000;
// Waits that keep one run inside one function call.
export const SERVERLESS_SMS_TIMEOUT_MS = 100000;
export const SERVERLESS_LIVE_VIEW_TIMEOUT_MS = 100000;

export async function closeStaleRuns(store, now = Date.now()) {
  const before = new Date(now - STALE_RUN_MS).toISOString();
  const stale = await store.staleActive(SITE, before);
  let closed = 0;
  for (const run of stale) {
    // After the submit click, or while the guest acted inside the live view, only OpenTable knows
    // whether a table exists, so the guest checks there. A run still waiting for a texted code never
    // finished, and every earlier step made nothing.
    const next = run.status === "submitting" || run.status === "awaiting_user_action"
      ? "unknown_after_submit"
      : "handback:timeout";
    const patch = { status: next, reason: "stale", sms_code: null, sms_code_expires_at: null, live_view_url: null };
    const done = await store.updateRun(run.id, patch, { expect: run.status });
    if (done) closed++;
  }
  return closed;
}

export async function runBookingAgentOnce(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const now = deps.now || Date.now;
  const config = deps.config || reserveConfiguration(env);
  const store = deps.store || createBookingAgentStore(config, fetchImpl);
  const repository = deps.repository || createReserveRepository(config, fetchImpl);
  const reaped = await closeStaleRuns(store, now());
  const result = await runNext({
    env: { ...env, BOOKING_AGENT_BROWSER_MODE: "browserbase" },
    store,
    now,
    launch: deps.launch || ((opts) => launchBrowserbaseCdp({ ...opts, env, fetchImpl })),
    loadProfile: (userId) => repository.readBookingProfile(userId),
    placeName: async (id) => (await repository.getInventoryPlace(id))?.name || null,
    log: deps.log || (() => {}),
    smsTimeoutMs: deps.smsTimeoutMs || SERVERLESS_SMS_TIMEOUT_MS,
    liveViewTimeoutMs: deps.liveViewTimeoutMs || SERVERLESS_LIVE_VIEW_TIMEOUT_MS,
    fetchImpl,
  });
  return { ...result, reaped };
}
