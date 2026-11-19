// One supervised run. Deterministic steps, a versioned selector map, no model in the loop.
// Supports both direct guest-form fixtures and live OpenTable 2-step flow (availability slots -> seating -> guest details -> optional SMS code relay -> confirmation).

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

function to12HourLabel(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || ""));
  if (!m) return null;
  const h24 = Number(m[1]);
  const min = m[2];
  const ap = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min} ${ap}`;
}

function formatPhoneForPage(phone, html) {
  const raw = String(phone || "").trim();
  if (/phoneNumberCountryCode/i.test(String(html || ""))) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    if (digits.length === 10) return digits;
  }
  return raw;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runNext(deps) {
  const store = deps.store;
  const env = deps.env || {};
  const now = deps.now || Date.now;
  const log = deps.log || (() => {});
  const stepMs = deps.stepTimeoutMs || STEP_TIMEOUT_MS;
  const runMs = deps.runTimeoutMs || RUN_TIMEOUT_MS;
  const smsTimeoutMs = deps.smsTimeoutMs || 120000;
  const smsPollMs = deps.smsPollMs || 1000;
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
  let deadline = now() + runMs;
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
    let first = await limited(() => page.snapshot());
    let firstKind = classifyPage(first);
    await event("detect", firstKind, { url: first.url || built.url, httpStatus: first.httpStatus });

    // OpenTable restref Step 1: availability slot picker -> optional seating modal -> Step 2 guest form.
    if (firstKind === "slots") {
      await go("selecting_slot");
      const targetLabel = to12HourLabel(built.sentTime);
      let picked = false;
      if (typeof page.clickSlot === "function") {
        picked = await limited(() => page.clickSlot(map.slotButton, targetLabel));
      } else if (map.slotButton) {
        await limited(() => page.click(map.slotButton));
        picked = true;
      }
      if (!picked) {
        await event("slot", "unavailable", { url: first.url || built.url });
        await stop("slot_unavailable");
        return { ran: true, id: opened.id, status, launched };
      }
      await event("slot", "selected", { url: first.url || built.url });
      if (typeof page.clickOptional === "function" && map.seatingOption) {
        const seated = await limited(() => page.clickOptional(map.seatingOption, 2500));
        if (seated) await event("seating", "selected", { url: first.url || built.url });
      }
      if (typeof page.waitForSettled === "function") {
        await limited(() => page.waitForSettled(map.fields.firstName, Math.min(stepMs, 8000)));
      }
      first = await limited(() => page.snapshot());
      firstKind = classifyPage(first);
      await event("detect", firstKind, { url: first.url || built.url, httpStatus: first.httpStatus });
    }

    if (firstKind !== "form") {
      const reason = DETECT_TO_HAND[firstKind] || "unrecognized_page";
      await stop(reason);
      return { ran: true, id: opened.id, status, launched };
    }
    await go("form_ready");
    await go("filling");
    const phoneValue = formatPhoneForPage(profile.mobile_phone, first.html);
    const fields = [
      [map.fields.firstName, profile.first_name],
      [map.fields.lastName, profile.last_name],
      [map.fields.phone, phoneValue],
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
    if (typeof page.waitForSettled === "function") {
      try {
        await limited(() => page.waitForSettled(null, Math.min(stepMs, 8000)));
      } catch { /* proceed to snapshot */ }
    }
    let after = await limited(() => page.snapshot());
    let afterKind = classifyPage(after);
    await event("detect", afterKind, { url: after.url || built.url, httpStatus: after.httpStatus });

    // Post-submit SMS verification code relay: pause in awaiting_sms_code and let the guest enter the code in chat.
    if (afterKind === "phone_code" && map.smsCodeInput && map.smsCodeSubmit) {
      await go("awaiting_sms_code", { reason: "phone_verification" });
      await event("sms_code", "awaiting", { url: after.url || built.url });
      const waitUntil = now() + smsTimeoutMs;
      deadline = Math.max(deadline, waitUntil + stepMs * 2);
      let code = null;
      while (now() < waitUntil) {
        const cur = await store.getRun(opened.id);
        if (!cur || cur.status === "cancelled_by_user") {
          status = "cancelled_by_user";
          return { ran: true, id: opened.id, status, launched };
        }
        if (cur.sms_code && /^[0-9]{4,8}$/.test(cur.sms_code)) {
          code = cur.sms_code;
          break;
        }
        await sleep(smsPollMs);
      }
      if (!code) {
        await stop("phone_verification");
        return { ran: true, id: opened.id, status, launched };
      }
      await go("submitting", { sms_code: null, reason: null });
      await event("sms_code", "submitted", { url: after.url || built.url });
      try {
        await limited(() => page.fill(map.smsCodeInput, code));
        await limited(() => page.click(map.smsCodeSubmit));
      } catch {
        await go("unknown_after_submit", { reason: "sms_submit" });
        await event("terminal", "unknown_after_submit");
        return { ran: true, id: opened.id, status, launched };
      }
      if (typeof page.waitForSettled === "function") {
        try {
          await limited(() => page.waitForSettled(null, Math.min(stepMs, 8000)));
        } catch { /* proceed to snapshot */ }
      }
      after = await limited(() => page.snapshot());
      afterKind = classifyPage(after);
      await event("detect", afterKind, { url: after.url || built.url, httpStatus: after.httpStatus });
    }

    if (afterKind === "challenge") await challenge();
    const restaurantName = deps.placeName ? await deps.placeName(opened.place_id) : null;
    const parsed = afterKind === "confirmation"
      ? parseConfirmation(after.html, { fallbackYear: String(opened.date).slice(0, 4), fallbackRestaurant: restaurantName })
      : null;
    const request = { date: String(opened.date).slice(0, 10), time: String(opened.time).slice(0, 5), party: opened.party };
    if (parsed && confirmationMatches(parsed, request)) {
      await go("confirmed", { confirmation_number: parsed.confirmationNumber, parsed_summary: parsed, reason: null });
      await event("terminal", "confirmed");
      try {
        await notifyConfirmedRun({ store, run: await store.getRun(opened.id), profile, restaurantName: restaurantName || parsed.restaurant, env, fetchImpl: deps.fetchImpl, now });
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
