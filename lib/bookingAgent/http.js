// HTTP handlers for /api/reserve/agent/*. Dark unless all three switches are on.
// The handler enqueues a run. It does not launch a browser. The worker claims the row later.

import { randomUUID } from "node:crypto";
import { sameOriginGroupRequest, readGroupJson } from "../groupPlanSecurity.js";
import { verifiedGroupOrganizer } from "../groupPlanRepository.js";
import { reserveConfiguration, createReserveRepository, ReserveStorageError } from "../reserveRepository.js";
import { createProviderRegistry } from "../reserveProviders/index.js";
import { handoffGoUrl } from "../reserveProviders/openTableHandoff.js";
import { cleanDate, cleanPartySize, cleanTime, zonedToday, RESERVE_UUID_RE } from "../reserve.js";
import { roundToHalfHour, OPENTABLE_MAX_PARTY } from "../reservePath.js";
import { refusalFor } from "./flags.js";
import { cancellable } from "./stateMachine.js";
import { sentenceFor, showHandoff, CONSENT_VERSION } from "./copy.js";
import { loadSelectorMap } from "./selectors.js";
import { createBookingAgentStore } from "./repository.js";
import { SITE } from "./constants.js";

const PLACE_ID = /^[A-Za-z0-9_-]{5,200}$/;
const HEADERS = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const reply = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const fail = (status, error, message) => reply({ ok: false, error, message }, status);

function sameOriginRead(req) {
  try {
    const own = new URL(req.url).origin;
    const secFetchSite = req.headers.get("sec-fetch-site");
    if (secFetchSite === "cross-site" || secFetchSite === "none") return false;
    const origin = req.headers.get("origin");
    if (origin) return origin === own;
    if (secFetchSite === "same-origin") return true;
    const referer = req.headers.get("referer");
    if (referer) return new URL(referer).origin === own;
    return false;
  } catch {
    return false;
  }
}

async function signedIn(req, config, fetchImpl) {
  try {
    return await verifiedGroupOrganizer(req, config, fetchImpl);
  } catch (error) {
    if (error?.code === "SIGN_IN_REQUIRED") throw new ReserveStorageError("SIGN_IN_REQUIRED", "Sign in to book a table.", 401);
    if (error?.code === "AUTH_UNAVAILABLE") throw new ReserveStorageError("AUTH_UNAVAILABLE", "We could not check your sign in. Please retry.", 503);
    throw error;
  }
}

function publicRun(run, name) {
  const status = run.status;
  const number = status === "confirmed" ? run.confirmation_number : null;
  return {
    id: run.id,
    status,
    reason: run.reason || null,
    sentence: sentenceFor(status, { confirmationNumber: number, restaurantName: name || "the restaurant" }),
    cancellable: cancellable(status),
    confirmation: status === "confirmed" && run.parsed_summary ? {
      number: run.parsed_summary.confirmationNumber || number,
      restaurant: run.parsed_summary.restaurant || name || null,
      date: run.parsed_summary.date || String(run.date).slice(0, 10),
      time: run.parsed_summary.time || String(run.time).slice(0, 5),
      party: run.parsed_summary.party || run.party,
    } : null,
    handoffUrl: showHandoff(status) ? handoffGoUrl({ placeId: run.place_id, date: String(run.date).slice(0, 10), time: String(run.time).slice(0, 5), partySize: run.party }) : null,
    checkUrl: status === "unknown_after_submit" ? handoffGoUrl({ placeId: run.place_id, date: String(run.date).slice(0, 10), time: String(run.time).slice(0, 5), partySize: run.party }) : null,
    placeId: run.place_id,
    date: String(run.date).slice(0, 10),
    time: String(run.time).slice(0, 5),
    partySize: run.party,
  };
}

export function createBookingAgentHandlers(deps = {}) {
  const env = () => deps.env || process.env;
  const now = () => (deps.now ? deps.now() : Date.now());
  const fetchImpl = () => deps.fetchImpl || fetch;
  const runtime = () => {
    if (deps.store && deps.registry && deps.readProfile) {
      return { store: deps.store, registry: deps.registry, readProfile: deps.readProfile, placeName: deps.placeName || (async () => null), config: deps.config || { url: "https://example.supabase.co", key: "test" } };
    }
    const config = reserveConfiguration(env());
    const repository = deps.repository || createReserveRepository(config, fetchImpl());
    return {
      config,
      store: deps.store || createBookingAgentStore(config, fetchImpl()),
      registry: deps.registry || createProviderRegistry({ repository, env: env() }),
      readProfile: deps.readProfile || ((userId) => repository.readBookingProfile(userId)),
      placeName: deps.placeName || (async (id) => (await repository.getInventoryPlace(id))?.name || null),
    };
  };
  const verify = (req, config) => (deps.verifyUser ? deps.verifyUser(req, config) : signedIn(req, config, fetchImpl()));
  const guarded = (fn) => async (req) => {
    try {
      return await fn(req);
    } catch (error) {
      const known = typeof error?.code === "string" && Number.isInteger(error?.status);
      if (!known) console.error("[booking-agent] request failed");
      return known ? fail(error.status, error.code, error.message) : fail(503, "UNAVAILABLE", "Booking help is unavailable right now. Please retry.");
    }
  };
  const gate = async (store) => {
    const e = env();
    if (String(e.BOOKING_AGENT_ENABLED || "") !== "1" || String(e.BOOKING_AGENT_SITE_OPENTABLE || "") !== "1") return "refused_flag_off";
    const site = await store.getSite(SITE);
    return refusalFor(e, site, now());
  };
  const refused = (code) => fail(404, code || "refused_flag_off", code === "refused_kill_switch" ? "Booking help is paused." : "Booking help is turned off.");

  return {
    start: guarded(async (req) => {
      const e = env();
      if (String(e.BOOKING_AGENT_ENABLED || "") !== "1" || String(e.BOOKING_AGENT_SITE_OPENTABLE || "") !== "1") return refused("refused_flag_off");
      if (!sameOriginGroupRequest(req)) return fail(403, "ORIGIN_REQUIRED", "Open Wayfind in your browser to continue.");
      const { store, registry, readProfile, config } = runtime();
      const why = await gate(store);
      if (why) return refused(why);
      const user = await verify(req, config);
      const body = await readGroupJson(req);
      if (body.consentVersion !== CONSENT_VERSION) return fail(400, "CONSENT_REQUIRED", "Please agree to the booking help note before we fill the form.");
      const placeId = typeof body.placeId === "string" ? body.placeId : "";
      if (!PLACE_ID.test(placeId)) return fail(400, "INVALID_PLACE", "Choose a restaurant.");
      const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
      if (!RESERVE_UUID_RE.test(key)) return fail(400, "INVALID_KEY", "Please try that again.");
      const today = zonedToday(now(), "America/New_York");
      const date = cleanDate(body.date, today, 60);
      const time = cleanTime(body.time);
      const party = cleanPartySize(body.partySize, OPENTABLE_MAX_PARTY);
      if (!date) return fail(400, "INVALID_DATE", "Choose a date.");
      if (!time) return fail(400, "INVALID_TIME", "Choose a time.");
      const sent = roundToHalfHour(time);
      if (sent !== time) return fail(400, "INVALID_TIME", "OpenTable uses an hour or a half hour.");
      if (!party) return fail(400, "INVALID_PARTY_SIZE", "Choose a party size from 1 to 20.");
      const provider = await registry.forPlace(placeId);
      if (!provider || provider.id !== "opentable_handoff" || !provider.link || !provider.link.rid) return fail(404, "NOT_OPENTABLE", "Booking help is only for a restaurant we hand off to OpenTable.");
      const profile = await readProfile(user.id);
      if (!profile || !profile.first_name || !profile.last_name || !profile.mobile_phone || !profile.preferred_email || !profile.consent_at) {
        return fail(400, "PROFILE_INCOMPLETE", "Add your name, phone and email on your Booking Profile first.");
      }
      const existing = await store.getRunByKey(key);
      if (existing) {
        if (existing.user_id !== user.id) return fail(409, "KEY_IN_USE", "Please try that again.");
        const name = await runtime().placeName(existing.place_id);
        return reply({ ok: true, run: publicRun(existing, name) }, 200);
      }
      let row;
      try {
        row = await store.insertRun({
          user_id: user.id,
          place_id: placeId,
          site: SITE,
          external_id: String(provider.link.rid),
          date,
          time: sent,
          party,
          idempotency_key: key,
          status: "queued",
          consent_version: CONSENT_VERSION,
          consent_at: new Date(now()).toISOString(),
          selector_map_version: loadSelectorMap().version,
          sms_consent: body.smsConsent === true,
          reason: null,
          confirmation_number: null,
          parsed_summary: null,
        });
      } catch (error) {
        if (error && error.code === "DUPLICATE") {
          const again = await store.getRunByKey(key);
          if (again && again.user_id === user.id) {
            const name = await runtime().placeName(again.place_id);
            return reply({ ok: true, run: publicRun(again, name) }, 200);
          }
          return fail(409, "KEY_IN_USE", "Please try that again.");
        }
        throw error;
      }
      const name = await runtime().placeName(placeId);
      return reply({ ok: true, run: publicRun(row, name) }, 201);
    }),

    status: guarded(async (req) => {
      const e = env();
      if (String(e.BOOKING_AGENT_ENABLED || "") !== "1" || String(e.BOOKING_AGENT_SITE_OPENTABLE || "") !== "1") return refused("refused_flag_off");
      if (!sameOriginRead(req)) return fail(403, "ORIGIN_REQUIRED", "Open Wayfind in your browser to continue.");
      const { store, config, placeName } = runtime();
      const why = await gate(store);
      if (why) return refused(why);
      const user = await verify(req, config);
      const id = new URL(req.url).searchParams.get("id") || "";
      if (!RESERVE_UUID_RE.test(id)) return fail(400, "INVALID_ID", "We could not find that.");
      const run = await store.getRun(id);
      if (!run || run.user_id !== user.id) return fail(404, "NOT_FOUND", "We could not find that.");
      const name = await placeName(run.place_id);
      return reply({ ok: true, run: publicRun(run, name) });
    }),

    cancel: guarded(async (req) => {
      const e = env();
      if (String(e.BOOKING_AGENT_ENABLED || "") !== "1" || String(e.BOOKING_AGENT_SITE_OPENTABLE || "") !== "1") return refused("refused_flag_off");
      if (!sameOriginGroupRequest(req)) return fail(403, "ORIGIN_REQUIRED", "Open Wayfind in your browser to continue.");
      const { store, config, placeName } = runtime();
      const why = await gate(store);
      if (why) return refused(why);
      const user = await verify(req, config);
      const body = await readGroupJson(req);
      const id = typeof body.id === "string" ? body.id : "";
      if (!RESERVE_UUID_RE.test(id)) return fail(400, "INVALID_ID", "We could not find that.");
      const run = await store.getRun(id);
      if (!run || run.user_id !== user.id) return fail(404, "NOT_FOUND", "We could not find that.");
      if (!cancellable(run.status)) return fail(409, "TOO_LATE", "This already went to OpenTable, so it cannot be cancelled here.");
      const updated = await store.updateRun(id, { status: "cancelled_by_user", reason: "guest", sms_code: null, sms_code_expires_at: null }, { expect: run.status });
      if (!updated) return fail(409, "TOO_LATE", "This already went to OpenTable, so it cannot be cancelled here.");
      const name = await placeName(run.place_id);
      return reply({ ok: true, run: publicRun(updated, name) });
    }),

    submitCode: guarded(async (req) => {
      const e = env();
      if (String(e.BOOKING_AGENT_ENABLED || "") !== "1" || String(e.BOOKING_AGENT_SITE_OPENTABLE || "") !== "1") return refused("refused_flag_off");
      if (!sameOriginGroupRequest(req)) return fail(403, "ORIGIN_REQUIRED", "Open Wayfind in your browser to continue.");
      const { store, config, placeName } = runtime();
      const why = await gate(store);
      if (why) return refused(why);
      const user = await verify(req, config);
      const body = await readGroupJson(req);
      const id = typeof body.id === "string" ? body.id : "";
      const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
      if (!RESERVE_UUID_RE.test(id)) return fail(400, "INVALID_ID", "We could not find that.");
      if (!/^[0-9]{4,8}$/.test(code)) return fail(400, "INVALID_CODE", "Enter the 4 to 8 digit code from your text message.");
      const run = await store.getRun(id);
      if (!run || run.user_id !== user.id) return fail(404, "NOT_FOUND", "We could not find that.");
      if (run.status !== "awaiting_sms_code") return fail(409, "NOT_AWAITING_CODE", "This booking is not waiting for a verification code.");
      if (run.sms_code_expires_at && Date.parse(run.sms_code_expires_at) <= now()) return fail(410, "CODE_EXPIRED", "That verification code window has expired.");
      if (run.sms_code) return fail(409, "CODE_ALREADY_SUBMITTED", "A verification code was already submitted for this booking.");
      if ((run.sms_code_attempts || 0) >= 3) return fail(429, "TOO_MANY_ATTEMPTS", "Too many verification code attempts.");
      const updated = await store.updateRun(
        id,
        { sms_code: code, sms_code_attempts: (run.sms_code_attempts || 0) + 1 },
        { expect: "awaiting_sms_code" },
      );
      if (!updated) return fail(409, "NOT_AWAITING_CODE", "This booking is no longer waiting for a verification code.");
      const name = await placeName(run.place_id);
      return reply({ ok: true, run: publicRun(updated, name) });
    }),
  };
}

export const _test = { publicRun, randomUUID };
