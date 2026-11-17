// One supervised run. Deterministic steps, a versioned selector map, no model in the loop.
// The same function is what a separate Node process or a Vercel Sandbox would call.
// Neither host is configured in this PR. Tests pass a fake browser. Nothing here contacts a live site.

import { AGENT_UA, SITE, STEP_TIMEOUT_MS, RUN_TIMEOUT_MS } from "./constants.js";
import { refusalFor, maxPerHour } from "./flags.js";
import { isTerminal } from "./stateMachine.js";
import { classifyPage, DETECT_TO_HAND } from "./detectors.js";
import { parseConfirmation, confirmationMatches } from "./confirmation.js";
import { applyChallenge } from "./circuitBreaker.js";
import { redact, pathOnly } from "./redact.js";
import { loadSelectorMap } from "./selectors.js";
import { notifyConfirmedRun } from "./notify.js";
import { openTableHandoffUrl } from "../reservePath.js";

function secretsOf(profile) {
  if (!profile) return [];
  const phone = String(profile.mobile_phone || "");
  const email = String(profile.preferred_email || "");
  return [profile.first_name, profile.last_name, phone, phone.replace(/^\+1/, ""), email, email.split("@")[0]].filter((s) => s && String(s).length >= 3);
}

function profileReady(profile) {
  return Boolean(profile && profile.first_name && profile.last_name && profile.mobile_phone && profile.preferred_email && profile.consent_at);
}

export async function runNext(deps) {
  const store = deps.store;
  const env = deps.env || {};
  const now = deps.now || Date.now;
  const log = deps.log || (() => {});
  const stepMs = deps.stepTimeoutMs || STEP_TIMEOUT_MS;
  const runMs = deps.runTimeoutMs || RUN_TIMEOUT_MS;
  const queued = await store.oldestQueued(SITE);
  if (!queued) return { ran: false };

  const site = await store.getSite(SITE);
  const refusal = refusalFor(env, site, now());
  if (refusal) {
    await store.updateRun(queued.id, { status: refusal, reason: refusal }, { expect: "queued" });
    log(redact(refusal, []));
    return { ran: true, id: queued.id, status: refusal, launched: false };
  }
  if (await store.countInProgress(SITE) > 0) return { ran: false, busy: true };
  const since = new Date(now() - 60 * 60 * 1000).toISOString();
  if (await store.countStartedSince(SITE, since) >= maxPerHour(env)) {
    await store.updateRun(queued.id, { status: "refused_kill_switch", reason: "hourly_cap" }, { expect: "queued" });
    return { ran: true, id: queued.id, status: "refused_kill_switch", launched: false };
  }

  const opened = await store.updateRun(queued.id, { status: "opening", selector_map_version: queued.selector_map_version }, { expect: "queued" });
  if (!opened) return { ran: false };

  const profile = await deps.loadProfile(opened.user_id);
  const secrets = secretsOf(profile);
  let status = "opening";
  let session = null;
  let launched = false;
  const deadline = now() + runMs;
  const map = deps.selectors || loadSelectorMap();

  const go = async (next, patch = {}) => {
    const updated = await store.updateRun(opened.id, { status: next, ...patch }, { expect: status });
    if (!updated) throw Object.assign(new Error("lost"), { code: "LOST" });
    status = next;
    return updated;
  };
  const event = async (step, outcome, extra = {}) => {
    const row = {
      step,
      outcome: redact(String(outcome || ""), secrets).slice(0, 80),
      url_path: extra.url ? pathOnly(extra.url) : null,
      http_status: Number.isInteger(extra.httpStatus) ? extra.httpStatus : null,
      ms: extra.ms ?? null,
    };
    await store.addEvent(opened.id, row);
    log(redact(JSON.stringify(row), secrets));
  };
  const limited = async (fn) => {
    if (now() > deadline) throw Object.assign(new Error("timeout"), { code: "TIMEOUT" });
    let timer;
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "TIMEOUT" })), stepMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const challenge = async () => {
    const next = applyChallenge(await store.getSite(SITE), now());
    await store.saveSite(SITE, next);
  };
  const stop = async (reason) => {
    if (isTerminal(status)) return status;
    if (status === "submitting") {
      await go("unknown_after_submit", { reason });
      await event("terminal", "unknown_after_submit");
      return status;
    }
    if (reason === "challenge") await challenge();
    const hand = reason === "timeout" ? "timeout" : reason;
    const next = ["challenge", "login_required", "payment_required", "phone_verification", "slot_unavailable", "unrecognized_page", "timeout"].includes(hand)
      ? `handback:${hand}`
      : "failed:internal";
    await go(next, { reason: hand });
    await event("terminal", next);
    return status;
  };

  try {
    if (!profileReady(profile)) {
      await go("failed:profile", { reason: "profile" });
      await event("terminal", "failed:profile");
      return { ran: true, id: opened.id, status, launched: false };
    }
    session = await deps.launch({ userAgent: AGENT_UA });
    launched = true;
    if (session.userAgent !== AGENT_UA) {
      await go("failed:browser", { reason: "browser" });
      await event("terminal", "failed:browser");
      return { ran: true, id: opened.id, status, launched };
    }
    const built = openTableHandoffUrl({
      rid: opened.external_id,
      date: String(opened.date).slice(0, 10),
      time: String(opened.time).slice(0, 5),
      party: opened.party,
    });
    if (!built || !built.url) {
      await go("failed:target", { reason: "target" });
      await event("terminal", "failed:target");
      return { ran: true, id: opened.id, status, launched };
    }
    log(redact(`open ${built.url}`, secrets));
    const page = await limited(() => session.open(built.url, { timeoutMs: stepMs }));
    const first = await limited(() => page.snapshot());
    const firstKind = classifyPage(first);
    await event("detect", firstKind, { url: first.url || built.url, httpStatus: first.httpStatus });
    if (firstKind !== "form") {
      const reason = DETECT_TO_HAND[firstKind] || "unrecognized_page";
      await stop(reason);
      return { ran: true, id: opened.id, status, launched };
    }
    await go("form_ready");
    await go("filling");
    const fields = [
      [map.fields.firstName, profile.first_name],
      [map.fields.lastName, profile.last_name],
      [map.fields.phone, profile.mobile_phone],
      [map.fields.email, profile.preferred_email],
    ];
    for (const [selector, value] of fields) {
      await limited(() => page.fill(selector, value));
      await event("fill", "typed", { url: first.url || built.url });
    }
    await go("review");
    const again = await limited(() => page.snapshot());
    const againKind = classifyPage(again);
    await event("detect", againKind, { url: again.url || built.url, httpStatus: again.httpStatus });
    if (againKind !== "form") {
      await stop(DETECT_TO_HAND[againKind] || "unrecognized_page");
      return { ran: true, id: opened.id, status, launched };
    }
    const kill = refusalFor(env, await store.getSite(SITE), now());
    if (kill) {
      await go("refused_kill_switch", { reason: "kill_switch" });
      await event("terminal", "refused_kill_switch");
      return { ran: true, id: opened.id, status, launched };
    }
    await go("submitting");
    await event("submit", "once", { url: again.url || built.url });
    try {
      await limited(() => page.click(map.submit));
    } catch {
      await go("unknown_after_submit", { reason: "network" });
      await event("terminal", "unknown_after_submit");
      return { ran: true, id: opened.id, status, launched };
    }
    const after = await limited(() => page.snapshot());
    const afterKind = classifyPage(after);
    await event("detect", afterKind, { url: after.url || built.url, httpStatus: after.httpStatus });
    if (afterKind === "challenge") await challenge();
    const parsed = afterKind === "confirmation" ? parseConfirmation(after.html) : null;
    const request = { date: String(opened.date).slice(0, 10), time: String(opened.time).slice(0, 5), party: opened.party };
    if (parsed && confirmationMatches(parsed, request)) {
      await go("confirmed", { confirmation_number: parsed.confirmationNumber, parsed_summary: parsed, reason: null });
      await event("terminal", "confirmed");
      try {
        const restaurantName = deps.placeName ? await deps.placeName(opened.place_id) : parsed.restaurant;
        await notifyConfirmedRun({ store, run: await store.getRun(opened.id), profile, restaurantName, env, fetchImpl: deps.fetchImpl, now });
      } catch {
        log(redact("sms_skipped", secrets));
      }
      return { ran: true, id: opened.id, status, launched };
    }
    await go("unknown_after_submit", { reason: parsed ? "mismatch" : "unparsed" });
    await event("terminal", "unknown_after_submit");
    return { ran: true, id: opened.id, status, launched };
  } catch (error) {
    if (!isTerminal(status)) {
      const reason = error && error.code === "TIMEOUT" ? "timeout" : "internal";
      if (status === "submitting") {
        await go("unknown_after_submit", { reason });
      } else if (reason === "timeout") {
        await go("handback:timeout", { reason: "timeout" });
      } else {
        await go("failed:internal", { reason: "internal" });
      }
      await event("terminal", status);
    }
    log(redact(error && error.code ? error.code : "error", secrets));
    return { ran: true, id: opened.id, status, launched };
  } finally {
    if (session) {
      try { await session.close(); } catch { /* already closed */ }
    }
  }
}
