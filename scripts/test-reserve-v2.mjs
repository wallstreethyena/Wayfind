// scripts/test-reserve-v2.mjs - locks Reserve v2 server behaviour by CALLING the code (lib/reservePath.js,
// lib/reserveProfile.js, lib/reserveFind.js and the handlers in lib/reserveApi.js with injected fakes).
// No network, no Supabase, no Anthropic. A few static checks run on comment-stripped source.
//   1 handoff URL (exact shape, half hour rounding, invalid params omitted)   2 path precedence
//   3 OpenTable is handoff only (flag seam, no booking path)                  4 profile rules + routes
//   5 profile fills a booking                                                 6 PII never reaches the model
//   7 find (order, real availability only)                                    8 go route 302s
//   9 history                                                                10 wiring (routes, middleware)
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createReserveHandlers } from "../lib/reserveApi.js";
import { openTableHandoffUrl, roundToHalfHour, resolveBookingPath, bookOnOpenTable } from "../lib/reservePath.js";
import { validateProfileInput, toE164, fillBookingFromProfile, PROFILE_CONSENT_VERSION } from "../lib/reserveProfile.js";
import { findTables, cleanFindRequest } from "../lib/reserveFind.js";
import { cleanGuestName } from "../lib/reserve.js";
import { ReserveStorageError } from "../lib/reserveRepository.js";
import { wayfindScore } from "../lib/wayfindScore.js";
import { toDisplayScore } from "../lib/score.js";

let failed = 0, count = 0;
const ok = (cond, msg) => { count++; if (!cond) { failed++; console.error("test-reserve-v2: FAIL - " + msg); } };

const ORIGIN = "https://www.gowayfind.com";
const NOW = Date.parse("2026-11-11T15:00:00Z"); // Wednesday 10:00 Eastern
const USER = "11111111-1111-4111-8111-111111111111";
const KEY = "3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f";
const ULELE = "ChIJ3Vyq7WTEwogRA-WDC7Mze2E";
const PARTNER_PLACE = "ChIJreservetestplace0001";
const DEMO_PLACE = "ChIJdemoplace000000002";
const PROD = { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc" };
const PREVIEW = { ...PROD, VERCEL_ENV: "preview" };
const bearer = { authorization: "Bearer " + "x".repeat(30) };
const post = (path, body, headers = {}) => new Request(ORIGIN + path, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...bearer, ...headers }, body: JSON.stringify(body) });
const put = (path, body, headers = {}) => new Request(ORIGIN + path, { method: "PUT", headers: { origin: ORIGIN, "content-type": "application/json", ...bearer, ...headers }, body: JSON.stringify(body) });
const del = (path, headers = {}) => new Request(ORIGIN + path, { method: "DELETE", headers: { origin: ORIGIN, ...bearer, ...headers } });
const get = (path, headers = {}) => new Request(ORIGIN + path, { headers: { ...bearer, ...headers } });
const json = async (res) => { const t = await res.text(); return { status: res.status, body: JSON.parse(t), headers: res.headers }; };

const partner = (id, name, over = {}) => ({ place_id: id, name, phone: "(941) 555-0100", stage: "live", active: true, max_party: 12, timezone: "America/New_York", lead_minutes: 60, window_days: 60, ...over });
const PARTNERS = [partner(PARTNER_PLACE, "Test Bistro"), partner(DEMO_PLACE, "Demo Diner", { stage: "demo", phone: null })];
const LINKS = [{ place_id: ULELE, external_id: "139954", external_slug: "ulele", active: true }, { place_id: PARTNER_PLACE, external_id: "111", external_slug: null, active: true }, { place_id: DEMO_PLACE, external_id: "222", external_slug: null, active: true }, { place_id: "ChIJinactivelink00000009", external_id: "333", external_slug: null, active: false }];

function fakeRepo({ partners = PARTNERS, links = LINKS, inventory = [], profile = null, slotsByPlace = {}, failSlotsFor = [], bookings = [] } = {}) {
  const calls = [];
  const log = (n, a) => calls.push({ n, a });
  let stored = profile;
  return {
    calls, get stored() { return stored; },
    async getPartner(id) { log("getPartner", id); return partners.find((p) => p.place_id === id) || null; },
    async listVisiblePartners(stages) { log("listVisiblePartners", stages); return partners.filter((p) => p.active && stages.includes(p.stage)); },
    async getPlatformLink(id) { log("getPlatformLink", id); const l = links.find((x) => x.place_id === id && x.active); return l || null; },
    async listActivePlatformPlaceIds() { log("listActivePlatformPlaceIds"); return links.filter((l) => l.active).map((l) => l.place_id); },
    async listPlatformLinks(ids) { log("listPlatformLinks", ids); return links.filter((l) => l.active && ids.includes(l.place_id)); },
    async getInventoryPlace(id) { log("getInventoryPlace", id); return inventory.find((r) => r.place_id === id) || null; },
    async searchRestaurants(a) { log("searchRestaurants", a); return inventory.filter((r) => !a.cuisine || (r.cuisines || []).includes(a.cuisine)); },
    async slots(place, date, party) { log("slots", { place, date, party }); if (failSlotsFor.includes(place)) throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "x"); return slotsByPlace[place] || []; },
    async book(a) {
      log("book", a);
      return { ok: true, booking: { id: "22222222-2222-4222-8222-000000000001", confirmation_code: "K7M2QX", status: "confirmed", place_id: a.placeId, party_size: a.partySize, reserve_date: a.date, reserve_time: a.time + ":00" } };
    },
    async readBookingProfile(u) { log("readBookingProfile", u); return stored; },
    async writeBookingProfile(u, v) { log("writeBookingProfile", { u, v }); stored = { ...v, updated_at: new Date(NOW).toISOString() }; return stored; },
    async removeBookingProfile(u) { log("removeBookingProfile", u); stored = null; return true; },
    async listAllUserBookings(u, since, limit) { log("listAllUserBookings", { u, since, limit }); return bookings; },
  };
}
function harness({ env = PROD, ...repoOpts } = {}, extra = {}) {
  const repository = fakeRepo(repoOpts);
  const handlers = createReserveHandlers({
    env, now: () => NOW, repository, fetchImpl: () => { throw new Error("network is not allowed in this guard"); },
    verifyUser: async () => ({ id: USER, hasVerifiedEmail: true }), afterResponse: () => {}, ...extra,
  });
  return { handlers, repository };
}

// ---- 0. partner list includes verified OpenTable restaurants ------------------------------
{
  const { handlers } = harness({ env: PROD });
  const r = await json(await handlers.partners(new Request(ORIGIN + "/api/reserve/partners")));
  ok(r.status === 200 && Array.isArray(r.body.placeIds), "partners list answers");
  ok(r.body.placeIds.includes(ULELE), "a verified OpenTable restaurant gets the Reserve button");
  ok(r.body.placeIds.includes(PARTNER_PLACE), "a live Wayfind partner still gets the Reserve button");
  ok(!r.body.placeIds.includes("ChIJinactivelink00000009"), "an inactive OpenTable link does not");
  ok(new Set(r.body.placeIds).size === r.body.placeIds.length, "no place listed twice");
}

// ---- 1. handoff URL ------------------------------------------------------------------
{
  const u = openTableHandoffUrl({ rid: "139954", date: "2026-11-14", time: "19:30", party: 4 });
  ok(u && u.url === "https://www.opentable.com/restref/client/?rid=139954&datetime=2026-11-14T19:30&covers=4" && u.sentTime === "19:30", "exact handoff shape: rid, datetime, covers in that order");
  ok(openTableHandoffUrl({ rid: 139954, date: "2026-11-14", time: "19:30", party: "4" }).url.endsWith("covers=4"), "a numeric rid and a string party are accepted");
  const t = (time) => openTableHandoffUrl({ rid: "1", date: "2026-11-14", time, party: 2 });
  ok(t("19:15").sentTime === "19:30" && t("19:15").url.includes("T19:30&"), "19:15 rounds to the nearest half hour: 19:30 (OpenTable offers only :00 and :30)");
  ok(t("19:10").sentTime === "19:00" && t("19:45").sentTime === "20:00" && t("19:00").sentTime === "19:00" && t("00:05").sentTime === "00:00", "19:10 to 19:00, 19:45 to 20:00, exact halves unchanged, 00:05 to 00:00");
  ok(t("23:50").sentTime === "23:30" && t("23:59").url.includes("2026-11-14T23:30") && t("23:45").sentTime === "23:30", "23:50 stays 23:30 and never rolls into the next day");
  ok(roundToHalfHour("7pm") === null && roundToHalfHour("24:00") === null && roundToHalfHour(null) === null, "roundToHalfHour refuses what is not HH:MM");
  ok(openTableHandoffUrl({ rid: "abc", date: "2026-11-14", time: "19:30", party: 2 }) === null && openTableHandoffUrl({ rid: "1; drop", date: "2026-11-14" }) === null && openTableHandoffUrl({}) === null && openTableHandoffUrl({ rid: "1234567890" }) === null, "a rid that is not 1 to 9 digits gives no URL");
  ok(openTableHandoffUrl({ rid: "7", date: "2026-13-45", time: "19:30", party: 2 }).url === "https://www.opentable.com/restref/client/?rid=7&covers=2", "a bad date drops datetime entirely, nothing is invented");
  ok(openTableHandoffUrl({ rid: "7", date: "2026-11-14", time: "banana", party: 2 }).url === "https://www.opentable.com/restref/client/?rid=7&covers=2" && openTableHandoffUrl({ rid: "7", time: "19:30", party: 2 }).sentTime === null, "a bad or lone time is omitted, sentTime is null");
  const p = (party) => openTableHandoffUrl({ rid: "7", date: "2026-11-14", time: "19:30", party }).url;
  ok(p(0).endsWith("T19:30") && p(21).endsWith("T19:30") && p("x").endsWith("T19:30") && p(1.5).endsWith("T19:30") && p(undefined).endsWith("T19:30"), "party outside 1..20 or not a whole number is omitted");
  ok(p(1).endsWith("covers=1") && p(20).endsWith("covers=20") && p(" 8 ").endsWith("covers=8"), "party 1, 20 and a padded 8 are accepted");
  ok(openTableHandoffUrl({ rid: "7" }).url === "https://www.opentable.com/restref/client/?rid=7", "with only a rid the URL is rid only");
}

// ---- 2. path resolution precedence -------------------------------------------------------
{
  const r = fakeRepo();
  const both = await resolveBookingPath(PARTNER_PLACE, { repository: r, env: PROD });
  ok(both.path === "wayfind" && both.partner.place_id === PARTNER_PLACE, "a visible active partner wins even when an OpenTable link exists");
  const ot = await resolveBookingPath(ULELE, { repository: r, env: PROD });
  ok(ot.path === "opentable" && ot.link.rid === "139954" && ot.link.slug === "ulele", "no partner, active link: opentable with the rid");
  const demoProd = await resolveBookingPath(DEMO_PLACE, { repository: r, env: PROD });
  ok(demoProd.path === "opentable" && demoProd.link.rid === "222", "a demo partner is not visible in production, so the OpenTable link is used");
  const demoPrev = await resolveBookingPath(DEMO_PLACE, { repository: r, env: PREVIEW });
  ok(demoPrev.path === "wayfind", "a demo partner IS visible outside production");
  ok((await resolveBookingPath("ChIJinactivelink00000009", { repository: r, env: PROD })).path === "none" && (await resolveBookingPath("ChIJnothing00000000", { repository: r, env: PROD })).path === "none" && (await resolveBookingPath("", { repository: r, env: PROD })).path === "none", "inactive link, unknown place and empty id all give none");
  const badRid = await resolveBookingPath("ChIJbadrid", { repository: fakeRepo({ links: [{ place_id: "ChIJbadrid", external_id: "12x", active: true }] }), env: PROD });
  ok(badRid.path === "none", "a stored link whose id is not digits is not trusted");
  const off = fakeRepo({ partners: [partner(PARTNER_PLACE, "Test Bistro", { active: false })] });
  ok((await resolveBookingPath(PARTNER_PLACE, { repository: off, env: PROD })).path === "opentable", "an inactive partner falls through to the OpenTable link");

  const h = harness();
  const w = await json(await h.handlers.path(get("/api/reserve/path?placeId=" + PARTNER_PLACE)));
  ok(w.status === 200 && JSON.stringify(w.body) === JSON.stringify({ ok: true, path: "wayfind", restaurant: { placeId: PARTNER_PLACE, name: "Test Bistro", phone: "(941) 555-0100" }, maxParty: 12 }), "path route shape for a partner: " + JSON.stringify(w.body));
  const h2 = harness({ inventory: [{ place_id: ULELE, name: "Ulele", status: "OPERATIONAL" }] });
  const o = await json(await h2.handlers.path(get("/api/reserve/path?placeId=" + ULELE)));
  ok(JSON.stringify(o.body) === JSON.stringify({ ok: true, path: "opentable", restaurant: { placeId: ULELE, name: "Ulele", phone: null }, maxParty: 20 }), "path route shape for OpenTable: " + JSON.stringify(o.body));
  const n = await json(await h2.handlers.path(get("/api/reserve/path?placeId=ChIJunknownplace0001")));
  ok(JSON.stringify(n.body) === JSON.stringify({ ok: true, path: "none", restaurant: { placeId: "ChIJunknownplace0001", name: null, phone: null } }), "path route shape for none has no maxParty");
  ok((await json(await h2.handlers.path(get("/api/reserve/path?placeId=a b")))).status === 400 && o.headers.get("cache-control") === "no-store", "bad place id is 400 and the answer is never cached");
}

// ---- 3. OpenTable is handoff only ------------------------------------------------------------
{
  const flagged = { ...PROD, RESERVE_OPENTABLE_API: "1" };
  let code = null;
  try { await resolveBookingPath(ULELE, { repository: fakeRepo(), env: flagged }); } catch (e) { code = e.code; }
  ok(code === "NOT_ENABLED", "RESERVE_OPENTABLE_API=1 makes resolution throw NOT_ENABLED (no fake implementation)");
  let c2 = null; try { bookOnOpenTable({}); } catch (e) { c2 = e.code; }
  ok(c2 === "NOT_ENABLED", "the OpenTable booking seam always refuses");
  const h = harness({ env: flagged });
  const r = await json(await h.handlers.path(get("/api/reserve/path?placeId=" + ULELE)));
  ok(r.status === 501 && r.body.error === "NOT_ENABLED", "the path route answers 501 NOT_ENABLED when the flag is on");
  ok((await resolveBookingPath(ULELE, { repository: fakeRepo(), env: { ...PROD, RESERVE_OPENTABLE_API: "0" } })).path === "opentable", "any value but 1 leaves the seam off");

  // An OpenTable-only restaurant can not be booked through Wayfind and never claims a confirmation.
  const hb = harness();
  const rb = await json(await hb.handlers.book(post("/api/reserve/book", { placeId: ULELE, partySize: 2, date: "2026-11-14", time: "19:30", guestName: "Gabe", idempotencyKey: KEY })));
  ok(rb.status === 404 && rb.body.error === "PARTNER_UNAVAILABLE" && !hb.repository.calls.some((x) => x.n === "book"), "book for an OpenTable-only place is refused and repository.book is never called");
  const pr = await json(await harness({ inventory: [{ place_id: ULELE, name: "Ulele" }] }).handlers.path(get("/api/reserve/path?placeId=" + ULELE)));
  ok(!("bookingId" in pr.body) && !("confirmationCode" in pr.body) && !("booking" in pr.body) && !("slots" in pr.body), "the opentable path answer carries no booking, confirmation or openings");

  // Static: nothing but reservePath.js knows the flag; nothing fetches OpenTable.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = d + "/" + f; return statSync(p).isDirectory() ? walk(p) : /\.(js|mjs)$/.test(p) ? [p] : []; });
  const files = [...walk("lib"), ...walk("app/api")];
  const flagUsers = files.filter((f) => /RESERVE_OPENTABLE_API/.test(strip(readFileSync(f, "utf8"))));
  ok(flagUsers.length === 1 && flagUsers[0] === "lib/reservePath.js", "RESERVE_OPENTABLE_API appears in exactly one file: " + flagUsers.join(","));
  const reserveFiles = files.filter((f) => /reserve/i.test(f));
  const fetchesOt = reserveFiles.filter((f) => /fetch\s*\([^)]*opentable/i.test(strip(readFileSync(f, "utf8"))));
  const callers = files.filter((f) => f !== "lib/reservePath.js" && /bookOnOpenTable/.test(strip(readFileSync(f, "utf8"))));
  ok(reserveFiles.length >= 10 && fetchesOt.length === 0 && callers.length === 0, "no reserve file fetches opentable.com and nothing calls bookOnOpenTable (" + reserveFiles.length + " reserve files scanned)");
  const apiSrc = strip(readFileSync("lib/reserveApi.js", "utf8"));
  ok(!/["']opentable["']/.test(apiSrc.slice(apiSrc.indexOf("    book: guarded"), apiSrc.indexOf("    mine: guarded"))), "the book handler never mentions the opentable path at all");
}

// ---- 4. profile: validation, consent, routes -------------------------------------------------
{
  const good = { firstName: " Gabe ", lastName: "Pereira", mobilePhone: "(941) 555-0100", preferredEmail: "Gabe@Example.com", defaultPartySize: 4, consent: true };
  const v = validateProfileInput(good, { now: NOW });
  ok(v.ok && v.value.first_name === "Gabe" && v.value.mobile_phone === "+19415550100" && v.value.preferred_email === "gabe@example.com" && v.value.default_party_size === 4, "a good profile normalizes: trimmed name, E.164 phone, lowercase email");
  ok(v.value.consent_at === new Date(NOW).toISOString() && v.value.consent_version === PROFILE_CONSENT_VERSION && PROFILE_CONSENT_VERSION === "reserve-profile-v1", "consent_at is now and consent_version is reserve-profile-v1");
  const code = (b) => { const r = validateProfileInput(b, { now: NOW }); return r.ok ? "OK" : r.error; };
  ok(code({ ...good, consent: undefined }) === "CONSENT_REQUIRED" && code({ ...good, consent: "true" }) === "CONSENT_REQUIRED" && code({ ...good, consent: false }) === "CONSENT_REQUIRED", "phone and email need consent === true exactly");
  ok(code({ mobilePhone: "9415550100" }) === "CONSENT_REQUIRED" && code({ preferredEmail: "a@b.co" }) === "CONSENT_REQUIRED", "phone alone or email alone also need consent");
  const names = validateProfileInput({ firstName: "Gabe", lastName: "P", defaultPartySize: 2 }, { now: NOW });
  ok(names.ok && names.value.consent_at === null && names.value.consent_version === null && names.value.mobile_phone === null, "a profile with only names and a party size needs no consent and stamps none");
  ok(code({ firstName: "x".repeat(61) }) === "INVALID_FIRST_NAME" && code({ firstName: "Bob123" }) === "INVALID_FIRST_NAME" && code({ lastName: "<b>" }) === "INVALID_LAST_NAME" && code({ firstName: "x".repeat(60) }) === "OK", "names are 1 to 60 letters");
  ok(code({ defaultPartySize: 0 }) === "INVALID_PARTY_SIZE" && code({ defaultPartySize: 21 }) === "INVALID_PARTY_SIZE" && code({ defaultPartySize: 1.5 }) === "INVALID_PARTY_SIZE" && code({ defaultPartySize: 20 }) === "OK" && code({ defaultPartySize: "6" }) === "OK", "party size 1 to 20");
  ok(code({ ...good, preferredEmail: "nope" }) === "INVALID_EMAIL" && code({ ...good, mobilePhone: "123" }) === "INVALID_PHONE" && code({ ...good, mobilePhone: "call me" }) === "INVALID_PHONE", "bad email and bad phone are rejected");
  ok(toE164("941-555-0100") === "+19415550100" && toE164("1 (941) 555-0100") === "+19415550100" && toE164("+44 20 7946 0958") === "+442079460958" && toE164("+0123456789") === null && toE164("555") === null && toE164("(041) 555-0100") === null, "US default, +1 form, international kept, junk rejected");
  ok(code(null) === "OK" && code("x") === "OK" && code({}) === "OK", "an empty profile is valid (everything is optional)");

  const h = harness();
  const empty = await json(await h.handlers.profileGet(get("/api/reserve/profile")));
  ok(empty.status === 200 && JSON.stringify(empty.body) === JSON.stringify({ ok: true, profile: null }), "GET with no saved profile: profile null");
  const noConsent = await json(await h.handlers.profilePut(put("/api/reserve/profile", { ...good, consent: false })));
  ok(noConsent.status === 400 && noConsent.body.error === "CONSENT_REQUIRED" && !h.repository.calls.some((x) => x.n === "writeBookingProfile"), "PUT without consent: 400 and nothing is saved");
  const saved = await json(await h.handlers.profilePut(put("/api/reserve/profile", good)));
  ok(saved.status === 200 && saved.body.ok && saved.body.profile.firstName === "Gabe" && saved.body.profile.mobilePhone === "+19415550100" && saved.body.profile.preferredEmail === "gabe@example.com" && saved.body.profile.defaultPartySize === 4 && saved.body.profile.consentVersion === "reserve-profile-v1" && saved.body.profile.consentAt === new Date(NOW).toISOString(), "PUT returns the saved profile in camelCase");
  const call = h.repository.calls.find((x) => x.n === "writeBookingProfile");
  ok(call.a.u === USER && !("user_id" in call.a.v), "the row is saved for the verified user id, never an id from the body");
  const bodyId = await json(await h.handlers.profilePut(put("/api/reserve/profile", { ...good, userId: "99999999-9999-4999-8999-999999999999", user_id: "99999999-9999-4999-8999-999999999999" })));
  ok(bodyId.status === 200 && h.repository.calls.filter((x) => x.n === "writeBookingProfile").every((x) => x.a.u === USER), "a user id in the body is ignored");
  const got = await json(await h.handlers.profileGet(get("/api/reserve/profile")));
  ok(got.body.profile && got.body.profile.lastName === "Pereira" && got.headers.get("cache-control") === "private, no-store", "GET returns the profile, private and uncached");
  const delRes = await json(await h.handlers.profileDelete(del("/api/reserve/profile")));
  ok(delRes.status === 200 && delRes.body.profile === null && h.repository.stored === null && h.repository.calls.some((x) => x.n === "removeBookingProfile" && x.a === USER), "DELETE removes the row");
  const noOrigin = await json(await h.handlers.profilePut(put("/api/reserve/profile", good, { origin: "https://evil.example" })));
  const noOriginDel = await json(await h.handlers.profileDelete(del("/api/reserve/profile", { origin: "https://evil.example" })));
  ok(noOrigin.status === 403 && noOriginDel.status === 403, "PUT and DELETE need the exact origin");
  const anon = harness({}, { verifyUser: async () => { throw new ReserveStorageError("SIGN_IN_REQUIRED", "Sign in to book a table.", 401); } });
  ok((await json(await anon.handlers.profileGet(get("/api/reserve/profile")))).status === 401 && (await json(await anon.handlers.history(get("/api/reserve/history")))).status === 401 && !anon.repository.calls.length, "profile and history need sign in and touch no data without it");
}

// ---- 5. the profile fills a booking ----------------------------------------------------------
{
  const profile = { first_name: "Gabe", last_name: "Pereira", mobile_phone: "+19415550100", preferred_email: "g@x.co", default_party_size: 4, consent_at: new Date(NOW).toISOString(), consent_version: "reserve-profile-v1" };
  const body = { placeId: PARTNER_PLACE, partySize: 2, date: "2026-11-14", time: "19:30", idempotencyKey: KEY };
  const booked = async (extra, prof = profile) => { const h = harness({ profile: prof }); const r = await json(await h.handlers.book(post("/api/reserve/book", { ...body, ...extra }))); return { r, call: h.repository.calls.find((x) => x.n === "book")?.a, h }; };
  const a = await booked({});
  ok(a.r.status === 201 && a.call.guestName === "Gabe Pereira" && a.call.phone === null && a.call.phoneConsent === false, "no name in the body: the booking uses the profile name; the phone is NOT sent without this booking's consent");
  const b = await booked({ phoneConsent: true });
  ok(b.call.phone === "(941) 555-0100" && b.call.phoneConsent === true && b.call.guestName === "Gabe Pereira", "phoneConsent true and a consented profile phone: the phone is filled server side");
  const c = await booked({ guestName: "Ann", phoneConsent: true, phone: "(727) 555-0199" });
  ok(c.call.guestName === "Ann" && c.call.phone === "(727) 555-0199", "values the guest typed win over the profile");
  ok(!c.h.repository.calls.some((x) => x.n === "readBookingProfile"), "nothing to fill: the profile is not even read");
  const d = await booked({ phoneConsent: true }, { ...profile, consent_at: null });
  ok(d.r.status === 400 && d.r.body.error === "INVALID_PHONE" && !d.h.repository.calls.some((x) => x.n === "book"), "a profile phone without stored consent is never used");
  const e = await booked({}, null);
  ok(e.r.status === 400 && e.r.body.error === "INVALID_NAME", "no profile and no name: the form error, as before");
  const long = await booked({}, { ...profile, first_name: "Gabriel", last_name: "P".repeat(50) });
  ok(long.call.guestName === "Gabriel", "a too long full name falls back to the first name");
  const intl = fillBookingFromProfile({ phoneConsent: true }, { ...profile, mobile_phone: "+442079460958" }, cleanGuestName);
  ok(intl.phone === undefined && intl.guestName === "Gabe Pereira", "a non US profile phone is not forced into the US only booking rules");
  const broken = harness({ profile });
  broken.repository.readBookingProfile = async () => { throw new ReserveStorageError("RESERVE_STORAGE_UNAVAILABLE", "x"); };
  const bh = createReserveHandlers({ env: PROD, now: () => NOW, repository: broken.repository, verifyUser: async () => ({ id: USER }), afterResponse: () => {} });
  const withName = await json(await bh.book(post("/api/reserve/book", { ...body, guestName: "Gabe" })));
  const noName = await json(await bh.book(post("/api/reserve/book", body)));
  ok(withName.status === 201 && noName.status === 400 && noName.body.error === "INVALID_NAME", "a profile read failure never blocks a booking that has its own name");
}

// ---- 6. PII never reaches the model ------------------------------------------------------------
{
  const profile = { first_name: "Zebediah", last_name: "Quillfeather", mobile_phone: "+19415550142", preferred_email: "zeb.quill@example.com", default_party_size: 4, consent_at: new Date(NOW).toISOString(), consent_version: "reserve-profile-v1" };
  const calls = [];
  const model = JSON.stringify({ reply: "Which time would you like?", draft: { partySize: 4, date: "2026-11-14", time: null, guestName: "Zebediah Quillfeather", note: null } });
  const deps = { aiKey: () => "k", model: "claude-test", breakerOpen: async () => null, tripBreaker: async () => {}, classifyProviderFailure: () => null,
    paidAnthropicRequest: async (init) => { calls.push(init); return new Response(JSON.stringify({ content: [{ type: "text", text: model }] }), { status: 200 }); } };
  const h = harness({ profile, slotsByPlace: { [PARTNER_PLACE]: ["19:30"] } }, deps);
  const r = await json(await h.handlers.chat(post("/api/reserve-chat", { placeId: PARTNER_PLACE, messages: [{ role: "user", content: "table for 4 on the 14th" }], draft: { partySize: 4, date: "2026-11-14", guestName: "Zebediah" } })));
  ok(calls.length === 1, "the chat made one model call");
  const sent = JSON.parse(calls[0].body);
  const flat = JSON.stringify(sent).toLowerCase();
  const pii = ["zebediah", "quillfeather", "9415550142", "941", "zeb.quill", "example.com", "+1941"];
  ok(pii.every((x) => !flat.includes(x)), "the outgoing model payload holds no profile name, phone or email: " + pii.filter((x) => flat.includes(x)).join(","));
  ok(!h.repository.calls.some((x) => x.n === "readBookingProfile") && sent.messages.length === 1 && sent.messages[0].content === "table for 4 on the 14th", "the chat handler never reads the profile; the model sees only the guest's own message");
  ok(!/guestName/.test(sent.system) && /Never ask for or write a name/.test(sent.system), "the prompt contract has no guestName and tells the model not to ask for a name");
  ok(r.body.ok && !("guestName" in r.body.draft) && r.body.draft.partySize === 4 && r.body.draft.date === "2026-11-14", "a name from the model never comes back in the draft (even when the client sent one)");
}

// ---- 7. find: order and real availability only ----------------------------------------------------
{
  const row = (id, name, rating, reviews, over = {}) => ({ place_id: id, name, locality: "Tampa", metro: "tampa", cuisines: ["cuban"], status: "OPERATIONAL", lat: 27.95, lng: -82.46, signals: rating == null ? {} : { rating, reviews }, ...over });
  const A = row("ChIJwayfindpartner01", "Partner Cubano", 4.4, 900);
  const B = row("ChIJopentablelink001", "Link Cubano", 4.6, 3000);
  const C = row("ChIJnolinkhighest001", "Walkup Cubano", 4.9, 5000);
  const D = row("ChIJnolinkunrated001", "Unrated Cubano", null, 0);
  const X = row("ChIJclosedplace00001", "Closed Cubano", 5, 9000, { status: "CLOSED_PERMANENTLY" });
  const SEED = row("ChIJseedplace0000001", "Seed Cubano", 4.5, 800);
  const inventory = [C, D, X, B, A, SEED];
  const partners = [partner("ChIJwayfindpartner01", "Partner Cubano")];
  const links = [{ place_id: "ChIJopentablelink001", external_id: "555", external_slug: null, active: true }];
  const score = (r) => toDisplayScore(wayfindScore(r.signals.rating, r.signals.reviews));
  const run = async (req, opts = {}) => findTables({ repository: fakeRepo({ inventory, partners, links, slotsByPlace: { "ChIJwayfindpartner01": ["17:00", "19:30", "20:15"] }, ...opts }), env: PROD, request: cleanFindRequest(req, "2026-11-11") });

  const all = await run({ cuisine: "cuban" });
  ok(all.ok && all.picks.length === 3, "at most 3 picks");
  ok(JSON.stringify(all.picks.map((p) => [p.placeId, p.path])) === JSON.stringify([["ChIJopentablelink001", "opentable"], ["ChIJwayfindpartner01", "wayfind"], ["ChIJnolinkhighest001", "none"]].map(([i, p]) => [i, p])), "bookable paths first (by score), then the best unbookable: " + JSON.stringify(all.picks.map((p) => [p.placeId, p.path])));
  ok(all.picks.every((p) => p.placeId !== X.place_id) && !all.picks.some((p) => p.placeId === "ChIJclosedplace00001"), "a restaurant that is not OPERATIONAL is never offered");
  const first = all.picks[0];
  ok(Object.keys(first).sort().join() === "cuisines,locality,name,path,placeId,score" && first.score === score(B) && first.locality === "Tampa" && first.cuisines[0] === "cuban", "pick shape and display score (/10) from the shared formula: " + Object.keys(first).join());
  const unrated = await run({ cuisine: "cuban", metro: "tampa" }, { inventory: [D] });
  ok(unrated.picks[0].score === null, "an unrated place has a null score, never 0");
  ok(all.picks.every((p) => p.path !== "opentable" || !("times" in p)) && all.picks.find((p) => p.path === "wayfind").times === undefined, "no day asked: no times are attached to any pick");

  const near = await run({ cuisine: "cuban", date: "2026-11-14", time: "20:00", party: 4 });
  const wf = near.picks.find((p) => p.path === "wayfind");
  ok(wf && JSON.stringify(wf.times) === JSON.stringify(["19:30", "20:15"]), "a partner is offered with ONLY the real times within 60 minutes of the request: " + JSON.stringify(wf && wf.times));
  ok(near.picks.filter((p) => p.path === "opentable").every((p) => p.times === undefined), "an OpenTable pick never carries openings");
  const far = await run({ cuisine: "cuban", date: "2026-11-14", time: "22:30", party: 4 });
  ok(!far.picks.some((p) => p.path === "wayfind") && far.picks.some((p) => p.path === "opentable"), "no real slot within 60 minutes: the partner is left out (nothing invented), the handoff pick stays");
  const down = await run({ cuisine: "cuban", date: "2026-11-14", time: "20:00", party: 4 }, { failSlotsFor: ["ChIJwayfindpartner01"] });
  ok(!down.picks.some((p) => p.path === "wayfind"), "when availability can not be checked the partner is not offered");
  const big = await run({ cuisine: "cuban", date: "2026-11-14", time: "20:00", party: 14 });
  ok(!big.picks.some((p) => p.path === "wayfind"), "a party above the partner's max is not offered");
  const exact = await run({ cuisine: "cuban", date: "2026-11-14", time: "18:30", party: 2 });
  ok(JSON.stringify(exact.picks.find((p) => p.path === "wayfind")?.times) === JSON.stringify(["19:30"]), "the window is +/- 60 minutes, edges included: 18:30 reaches 19:30 but not 17:00 or 20:15");

  const repo = fakeRepo({ inventory, partners, links });
  const sim = await findTables({ repository: repo, env: PROD, request: cleanFindRequest({ placeId: SEED.place_id }, "2026-11-11") });
  const search = repo.calls.find((x) => x.n === "searchRestaurants").a;
  ok(search.cuisine === "cuban" && search.metro === "tampa" && sim.picks.every((p) => p.placeId !== SEED.place_id) && sim.picks.length === 3, "placeId mode: same cuisine and metro as that place, and that place is excluded");
  ok((await findTables({ repository: fakeRepo({ inventory }), env: PROD, request: cleanFindRequest({ placeId: "ChIJmissingplace0001" }, "2026-11-11") })).picks.length === 0, "similar picks for an unknown place: none");
  ok((await findTables({ repository: fakeRepo({ inventory: [row("ChIJnocuisine0000001", "No Cuisine", 4, 100, { cuisines: [] })] }), env: PROD, request: cleanFindRequest({ placeId: "ChIJnocuisine0000001" }, "2026-11-11") })).picks.length === 0, "similar picks for a place with no cuisine on file: none, not a guess");
  const q = fakeRepo({ inventory });
  await findTables({ repository: q, env: PROD, request: cleanFindRequest({ query: "Cuban", lat: 27.95, lng: -82.46 }, "2026-11-11") });
  const qs = q.calls.filter((x) => x.n === "searchRestaurants").map((x) => x.a);
  ok(qs.some((a) => a.cuisine === "cuban") && qs.some((a) => a.nameLike === "Cuban") && qs.every((a) => a.lat === 27.95 && a.lng === -82.46), "a free text query searches cuisine and name, near the given point");
  const clean = cleanFindRequest({ query: "<script>", cuisine: "Bad;DROP", lat: 999, lng: "x", date: "2020-01-01", time: "19:10", party: 99, metro: "NOT OK!" }, "2026-11-11");
  ok(clean.query === null && clean.cuisine === null && clean.lat === null && clean.lng === null && clean.date === null && clean.time === null && clean.party === null && clean.metro === null, "every invalid filter is dropped, not guessed");
  const hf = harness({ inventory, partners, links });
  const rf = await json(await hf.handlers.find(post("/api/reserve/find", { cuisine: "cuban" })));
  ok(rf.status === 200 && rf.body.ok && Array.isArray(rf.body.picks) && rf.body.picks.length === 3 && rf.headers.get("cache-control") === "no-store", "find route: {ok,picks}, uncached");
  ok((await json(await hf.handlers.find(post("/api/reserve/find", { cuisine: "cuban" }, { origin: "https://evil.example" })))).status === 403, "find route needs the exact origin");
}

// ---- 8. go route ---------------------------------------------------------------------------------------
{
  const events = [];
  const emit = (event, extra) => { events.push({ event, properties: { provider: "opentable", ...extra } }); };
  const goTo = async (qs, headers = {}) => { events.length = 0; const h = harness({}); const res = await h.handlers.go(new Request(ORIGIN + "/api/reserve/go?" + qs, { headers }), emit); return { res, loc: res.headers.get("location"), ev: events.slice() }; };
  const a = await goTo(`placeId=${ULELE}&date=2026-11-14&time=19:15&party=4`);
  ok(a.res.status === 302 && a.loc === "https://www.opentable.com/restref/client/?rid=139954&datetime=2026-11-14T19:30&covers=4", "with a verified link: 302 to the OpenTable form, time rounded to the half hour: " + a.loc);
  ok(a.ev.length === 1 && a.ev[0].event === "provider_redirect_started" && a.ev[0].properties.resolver_path === "opentable_restref" && a.ev[0].properties.provider === "opentable", "one server event with resolver_path opentable_restref");
  ok(/no-store/.test(a.res.headers.get("cache-control")), "the redirect is never cached");
  const b = await goTo(`placeId=ChIJunlinkedplace0001&date=2026-11-14&time=19:30&party=2`);
  ok(b.res.status === 302 && b.loc === ORIGIN + "/p/ChIJunlinkedplace0001" && b.ev[0].properties.resolver_path === "place_page_fallback", "no link: 302 to our own place page, event resolver_path place_page_fallback");
  const c = await goTo(`placeId=${ULELE}&date=nope&time=zz&party=99`);
  ok(c.loc === "https://www.opentable.com/restref/client/?rid=139954", "invalid date, time and party are omitted from the handoff");
  const d = await goTo(`placeId=%3Cbad%3E`);
  ok(d.res.status === 302 && d.loc === ORIGIN + "/" && d.ev.length === 0, "a bad place id lands on the home page and emits nothing");
  const e = await goTo(`placeId=${ULELE}&date=2026-11-14&time=19:30&party=2`, { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  ok(e.res.status === 302 && e.loc === ORIGIN + "/p/" + ULELE && e.ev.length === 0, "a crawler is sent to the place page, never to OpenTable, and emits no event");
  const boom = harness({});
  boom.repository.getPlatformLink = async () => { throw new Error("db down"); };
  const f = await boom.handlers.go(new Request(ORIGIN + "/api/reserve/go?placeId=" + ULELE), emit);
  ok(f.status === 302 && f.headers.get("location") === ORIGIN + "/p/" + ULELE, "a storage failure still redirects to the place page, never an error page");
}

// ---- 9. history ---------------------------------------------------------------------------------------
{
  const mk = (i) => ({ id: "22222222-2222-4222-8222-" + String(i).padStart(12, "0"), confirmation_code: "K7M2QX", status: "confirmed", place_id: PARTNER_PLACE, party_size: 2, reserve_date: "2026-11-20", reserve_time: "19:30:00", proposed_date: null, proposed_time: null, created_at: "2026-11-10T00:00:00Z", user_id: "SHOULD-NOT-LEAK", wf_reserve_partners: { name: "Test Bistro", phone: "(941) 555-0100" } });
  const h = harness({ bookings: Array.from({ length: 25 }, (_, i) => mk(i)) });
  const r = await json(await h.handlers.history(get("/api/reserve/history")));
  const call = h.repository.calls.find((x) => x.n === "listAllUserBookings").a;
  ok(r.status === 200 && r.body.ok && r.body.bookings.length === 20, "history returns at most 20 bookings");
  ok(call.u === USER && call.since === "2026-10-12" && call.limit === 20, "history asks for the signed in user from 30 days back: " + JSON.stringify(call));
  const b = r.body.bookings[0];
  ok(JSON.stringify(Object.keys(b).sort()) === JSON.stringify(["confirmationCode", "date", "id", "partySize", "placeId", "restaurantName", "restaurantPhone", "status", "time"]) && b.time === "19:30" && b.restaurantName === "Test Bistro" && b.restaurantPhone === "(941) 555-0100", "history item shape: " + Object.keys(b).join());
  ok(!JSON.stringify(r.body).includes("SHOULD-NOT-LEAK") && r.headers.get("cache-control") === "private, no-store", "no user id leaks and the answer is private");
}

// ---- 10. wiring ---------------------------------------------------------------------------------------------
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  const want = { profile: ["GET", "PUT", "DELETE"], path: ["GET"], go: ["GET"], find: ["POST"], history: ["GET"] };
  for (const [name, methods] of Object.entries(want)) {
    const f = `app/api/reserve/${name}/route.js`;
    const src = existsSync(f) ? strip(readFileSync(f, "utf8")) : "";
    ok(methods.every((m) => new RegExp(`export async function ${m}\\(req\\)`).test(src)) && /createReserveHandlers\(\)/.test(src) && /dynamic = "force-dynamic"/.test(src), `${f} exports ${methods.join("/")} through createReserveHandlers`);
  }
  const goSrc = strip(readFileSync("app/api/reserve/go/route.js", "utf8"));
  ok(/commercePayload\(event, \{[^}]*\.\.\.landingFromCookieHeader\(req\.headers\.get\("cookie"\)\)/.test(goSrc) && /captureServerInBackground\(event/.test(goSrc) && /\.go\(req, emit\)/.test(goSrc), "the go route stamps the landing cookie, fires the server event and passes emit to the handler");
  const mw = strip(readFileSync("middleware.js", "utf8"));
  const set = /RATE_LIMIT_ONLY_ROUTES = new Set\(\[([^\]]*)\]/.exec(mw)?.[1] || "";
  const matcher = /matcher:\s*\[([\s\S]*?)\n  \],/.exec(mw)?.[1] || "";
  const routes = ["/api/reserve/path", "/api/reserve/find", "/api/reserve/profile", "/api/reserve/history", "/api/reserve/go"];
  ok(routes.every((p) => matcher.includes(`"${p}"`) && set.includes(`"${p}"`)), "every v2 route is in the middleware matcher AND the rateLimitOnly set (go is a navigation)");
}

if (failed) { console.error(`test-reserve-v2: ${failed} of ${count} assertions failed`); process.exit(1); }
console.log(`test-reserve-v2: OK - ${count} assertions (code called with injected fakes, no network; static checks on comment-stripped source)`);
