// Lock test for the 2026-11-23 Group Vote overhaul:
// 1. Site-wide Share -> Group Vote prefill preservation (including places/ChIJ... & tours)
// 2. Wayfind IP location/type/vibe recommendations + matching experiences (1..5 options)
// 3. Optional Santa AI co-pilot (grounded-only, deterministic fallback, share drafts)
// 4. Compliant first-party Twilio SMS (organizer + optional opted-in voter, HMAC callback)
// 5. Service end-to-end (custom selectedPlaceIds, groupToken, join_respond -> slotToken, delete/clean/dismiss)
// 6. Native Wayfind styling (zero purple hex overrides) & simplified ballot / organizer / history UI
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { concreteSharePlaceId, groupPlanHref, groupSubjectId } from "../lib/shareContext.js";
import { extractPlaceVibes, experienceCategoriesForPlace, recommendGroupOptions } from "../lib/groupPlanCandidates.js";
import { createGroupPlaceData } from "../lib/groupPlanPlaceData.js";
import { deterministicSantaLineup, parseSantaCurate, santaCurateShortlist } from "../lib/groupPlanSanta.js";
import { groupShareMessage, ORGANIZER_SMS_CONSENT_TEXT, PARTICIPANT_SMS_CONSENT_TEXT } from "../lib/groupPlanShareText.js";
import { groupSmsConfig, groupSmsText, sendGroupPlanSms, applyGroupSmsStatusCallback } from "../lib/groupPlanSms.js";
import { createGroupPlanService } from "../lib/groupPlanService.js";
import { createGroupPlan, applyGroupPlanCommand, groupPlanView, organizerPlanView } from "../lib/groupPlan.js";
import { groupVoteModel, footFits } from "../lib/shareCardCopy.js";
import { heroFallbackModel } from "../lib/heroCard.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let assertions = 0;
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); assertions++; };
const ok = (c, msg) => { assert.ok(c, msg); assertions++; };
const matches = (v, r, msg) => { assert.match(v, r, msg); assertions++; };
const absent = (v, r, msg) => { assert.doesNotMatch(v, r, msg); assertions++; };

// 1. Site-wide Share -> Group Vote prefill normalization & card source locks
eq(concreteSharePlaceId("places/ChIJabc1234567890"), "ChIJabc1234567890", "strips Google places/ resource prefix");
eq(concreteSharePlaceId("ChIJabc1234567890"), "ChIJabc1234567890", "passes plain Google place id");
eq(concreteSharePlaceId("bad/path"), "", "negative control: arbitrary slash path still rejected");
eq(groupSubjectId({ type: "event", id: "e1", place_id: "ChIJvenue12345" }), "ChIJvenue12345", "accepts snake_case place_id");
eq(new URL(groupPlanHref("ChIJ12345", "Ulele — found on Wayfind", true), "https://x.test").searchParams.get("name"), "Ulele", "strips trailing found on Wayfind suffix");

for (const [rel, pattern] of [
  ["app/components/RailCard.js", /actionItem\.placeId \|\| actionItem\.place_id/],
  ["app/components/RailCard.js", /doShare = onShare \|\| \(canFallback \? \(\) => fallbackShare/],
  ["app/components/IconicPlaceCard.js", /placeId:\s*place\.id/],
  ["app/components/SponsoredPlaceCard.js", /placeId:\s*\(place && place\.id\)/],
  ["app/components/BestNearby.js", /p\.place_id \|\| p\.id/],
  ["app/components/CreatorFinds.js", /onShare=\{h && h\.id && onShare \? \(\) => onShare/],
  ["app/components/GuideMapExplorer.js", /placeId:\s*spot\.placeId \|\| spot\.place_id/],
  ["app/components/ShareButton.js", /placeId:\s*\(invite && invite\.placeId\)/],
  ["app/components/ChristmasIntentRails.js", /placeId:\s*card\.place_id/],
  ["app/components/FallIntentRails.js", /placeId:\s*card\.place_id/],
  ["app/events/[city]/[slug]/EventActions.js", /placeId:\s*event\.place_id \|\| event\.placeId/],
  ["app/components/screens/Map.js", /placeId:\s*ev\.place_id/],
  ["app/home.js", /experienceGroupId\(/],
]) {
  matches(readFileSync(path.join(ROOT, rel), "utf8"), pattern, `${rel} preserves placeId/groupId for Group Vote`);
}

// 2. Wayfind IP Recommendations (location + type + vibe + matching experiences)
const seed = {
  id: "ChIJseed1111111111", name: "Ulele", lat: 27.958, lng: -82.463,
  city: "Tampa", metro: "tampa-bay", primaryType: "seafood_restaurant",
  category: "food", score: 91, priceLevel: 3, status: "OPERATIONAL", excluded: false,
  tags: ["waterfront", "craft_beer"], googleTypes: ["seafood_restaurant", "bar", "restaurant"],
};
const vibes = extractPlaceVibes(seed);
ok(vibes.has("waterfront") && vibes.has("seafood") && vibes.has("beer") && vibes.has("datenight"), "extractPlaceVibes captures waterfront/seafood/beer/datenight");
ok(experienceCategoriesForPlace(seed).includes("water") && experienceCategoriesForPlace(seed).includes("walking"), "experienceCategoriesForPlace maps waterfront dining to water & walking tours");

const candPool = [
  seed,
  { id: "ChIJmatch111111111", name: "Riverfront Grill", lat: 27.961, lng: -82.460, city: "Tampa", metro: "tampa-bay", primaryType: "seafood_restaurant", category: "food", score: 86, priceLevel: 3, status: "OPERATIONAL", excluded: false, tags: ["waterfront"] },
  { id: "ChIJmatch222222222", name: "Bay Bistro", lat: 27.955, lng: -82.458, city: "Tampa", metro: "tampa-bay", primaryType: "american_restaurant", category: "food", score: 89, priceLevel: 2, status: "OPERATIONAL", excluded: false, tags: ["waterfront"] },
  { id: "ChIJbeach999999999", name: "Clearwater Beach", lat: 27.977, lng: -82.827, city: "Clearwater", metro: "tampa-bay", primaryType: "beach", category: "beach", score: 95, status: "OPERATIONAL", excluded: true },
  { id: "ChIJclosed99999999", name: "Closed Spot", lat: 27.959, lng: -82.462, city: "Tampa", metro: "tampa-bay", primaryType: "seafood_restaurant", category: "food", score: 94, status: "CLOSED_PERMANENTLY", excluded: false },
];
const expPool = [
  { id: "vx_11P1", product_code: "11P1", kind: "experience", name: "Tampa Riverwalk Sunset Cruise", city: "Tampa", destId: "666", dest_id: "666", categories: ["water", "walking"], title: "Tampa Riverwalk Sunset Cruise", score: 92, rating: 4.8, reviews: 420, duration_min: 120, image: "https://media.tacdn.com/a.jpg", link_ok: true, status: "OPERATIONAL" },
  { id: "vx_22P2", product_code: "22P2", kind: "experience", name: "Miami Tour", city: "Miami", destId: "662", dest_id: "662", categories: ["water"], title: "Miami Tour", score: 95, rating: 4.9, reviews: 800, duration_min: 120, image: "https://media.tacdn.com/b.jpg", link_ok: true, status: "OPERATIONAL" },
];
const recs = recommendGroupOptions(seed, candPool, expPool);
eq(recs.places.length, 2, "recommends similar operational nearby spots even when score < original");
ok(recs.places.every((p) => p.id !== seed.id && p.id !== "ChIJbeach999999999" && p.id !== "ChIJclosed99999999"), "excludes seed, excluded beaches, and non-operational venues");
ok(recs.places[0].matchReasons.length >= 2, "recommendations include concrete matchReasons");
eq(recs.experiences.length, 1, "includes matching same-city experience and excludes faraway city");
eq(recs.experiences[0].id, "vx_11P1", "matched Riverwalk cruise experience");

// Mixed place + experience hydrate & suggest in createGroupPlaceData
{
  const NOW = Date.parse("2026-11-23T18:00:00Z");
  const rawSeed = { place_id: seed.id, name: seed.name, lat: seed.lat, lng: seed.lng, locality: seed.city, postal_city: seed.city, metro: seed.metro, primary_type: "seafood_restaurant", category: "food", governed_score: 91, signals: { priceNum: 3 }, status: "OPERATIONAL", excluded: false, tags: ["waterfront", "craft_beer"], google_types: ["seafood_restaurant", "bar"] };
  const rawMatch = { place_id: "ChIJmatch111111111", name: "Riverfront Grill", lat: 27.961, lng: -82.460, locality: "Tampa", postal_city: "Tampa", metro: "tampa-bay", primary_type: "seafood_restaurant", category: "food", governed_score: 86, signals: { priceNum: 3 }, status: "OPERATIONAL", excluded: false, tags: ["waterfront"] };
  const placeRows = [rawSeed, rawMatch];
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes("/rest/v1/wf_experiences")) return { ok: true, json: async () => expPool.filter((e) => e.city === "Tampa") };
    if (u.includes("/rest/v1/wf_inventory")) {
      const sp = new URL(u).searchParams;
      if (sp.get("place_id")) {
        const val = sp.get("place_id");
        const wanted = val.startsWith("eq.") ? [val.slice(3)] : val.replace(/^in\.\(|\)$/g, "").split(",");
        return { ok: true, json: async () => placeRows.filter((r) => wanted.includes(r.place_id)) };
      }
      return { ok: true, json: async () => placeRows };
    }
    return { ok: true, json: async () => [] };
  };
  const pd = createGroupPlaceData({ url: "https://db.test", key: "k" }, { fetchImpl, env: {}, photoResolver: async () => null });
  const mixed = await pd.hydrate([seed.id, "vx_11P1"], [], NOW);
  eq(mixed.map((x) => x.id), [seed.id, "vx_11P1"], "hydrate preserves mixed order");
  eq(mixed.map((x) => x.kind || "place"), ["place", "experience"], "hydrate supports mixed places and experiences");
  const suggested = await pd.suggest(seed.id, NOW);
  eq(suggested.seed.id, seed.id, "suggest returns hydrated original seed");
  eq(suggested.places[0].id, "ChIJmatch111111111", "suggest returns similar nearby place");
  eq(suggested.experiences[0].id, "vx_11P1", "suggest returns matching nearby experience");
  const prep = await pd.prepareSelected([seed.id, "vx_11P1"], [], NOW);
  eq(prep.places.map((p) => p.id), [seed.id, "vx_11P1"], "prepareSelected verifies user's custom mixed lineup");
  const foundExp = await pd.searchExperiences("Riverwalk", null, NOW);
  eq(foundExp[0].id, "vx_11P1", "searchExperiences finds matching tours");
}

// 3. Optional Santa AI co-pilot (grounded-only & deterministic fallback)
{
  const fb = deterministicSantaLineup({
    seed: { id: "ChIJ1", name: "Ulele" },
    places: [{ id: "ChIJ2", name: "Bistro" }, { id: "ChIJ3", name: "Grill" }],
    experiences: [{ id: "vx_11P1", name: "Food Cruise" }],
  });
  eq(fb.selectedIds, ["ChIJ1", "ChIJ2", "ChIJ3", "vx_11P1"], "deterministic Santa pairs seed + top places + matching experience");
  absent(fb.note, /[-\u2013\u2014]/, "Santa note has no dashes");

  const parsed = parseSantaCurate('{"selectedIds":["ChIJ2","INVENTED_ID","vx_11P1"],"note":"Great coastal evening lineup for your crew."}', ["ChIJ1", "ChIJ2", "vx_11P1"], "ChIJ1");
  eq(parsed.selectedIds, ["ChIJ1", "ChIJ2", "vx_11P1"], "parseSantaCurate strips any hallucinated IDs");
  eq(parseSantaCurate('{"selectedIds":["INVENTED"],"note":"x"}', ["ChIJ1"], "ChIJ1").selectedIds, ["ChIJ1"], "never invents an ID");
  eq(parseSantaCurate('{"selectedIds":["INVENTED"],"keepOriginal":false,"note":"x"}', ["ChIJ1"], "ChIJ1"), null, "rejects empty grounded lineup");

  let fetched = 0;
  const noKeyOut = await santaCurateShortlist({ seed: { id: "ChIJ1", name: "Ulele" }, places: [{ id: "ChIJ2", name: "Bistro" }], experiences: [], env: {}, fetchImpl: async () => { fetched++; } });
  eq(fetched, 0, "no Anthropic call when key absent");
  eq(noKeyOut.source, "fallback", "gracefully falls back deterministically");

  const plainSingle = groupShareMessage({ organizerName: "gabriel", places: [{ name: "Ulele" }], url: "https://www.gowayfind.com/group-plans/x#group=t", santa: false, single: true });
  const santaGroup = groupShareMessage({ organizerName: "gabriel", places: [{ name: "Ulele" }, { name: "Armature Works" }], url: "https://www.gowayfind.com/group-plans/x#group=t", santa: true, single: false });
  matches(plainSingle, /^Gabriel started a quick Wayfind vote/, "capitalizes host name in plain single message");
  matches(santaGroup, /^Ho ho, crew! Gabriel put Ulele and 1 other option/, "Santa group draft includes host, option count, and URL");
  matches(santaGroup, /#group=t$/, "message carries exact group URL");
}

// 4. Compliant First-Party Twilio SMS
{
  const validEnv = {
    WF_GROUP_PLAN_SMS_ENABLED: "1",
    TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
    TWILIO_AUTH_TOKEN: "fixture_twilio_secret_token_1234",
    TWILIO_FROM_NUMBER: "+18135550100",
    NEXT_PUBLIC_SITE_URL: "https://www.gowayfind.com",
  };
  eq(groupSmsConfig({}), null, "SMS stays dark without env");
  eq(groupSmsConfig({ ...validEnv, WF_GROUP_PLAN_SMS_ENABLED: "0" }), null, "explicit 0 disables SMS");
  ok(groupSmsConfig(validEnv)?.callbackUrl === "https://www.gowayfind.com/api/group-plans/sms-status", "derives verified callback URL");
  matches(groupSmsText("organizer_created", { placeName: "Ulele", groupUrl: "https://x.test/g", organizerUrl: "https://x.test/o" }), /Reply STOP to opt out\./, "organizer_created includes STOP opt-out");
  matches(groupSmsText("organizer_closed", { placeName: "Ulele", organizerUrl: "https://x.test/o", replyCount: 3 }), /3 replies/, "organizer_closed shows reply count");
  matches(groupSmsText("participant_finalized", { placeName: "Ulele", finalUrl: "https://x.test/f", timeLabel: "Sat 7 PM" }), /locked in Ulele/, "participant_finalized names locked spot");

  const rows = new Map();
  let twilioPosts = 0;
  const repo = {
    async claimSms({ planId, slotKey, kind, recipient, consentAt, consentText }) {
      const k = `${planId}:${slotKey}:${kind}`;
      if (rows.has(k)) return { ...rows.get(k), claimed: false };
      const r = { id: "sms-1", plan_id: planId, slot_key: slotKey, kind, recipient, consent_at: consentAt, consent_text: consentText, status: "sending", attempts: 0, provider: null, provider_message_id: null };
      rows.set(k, r);
      return { ...r, claimed: true };
    },
    async markSms(id, patch) {
      for (const r of rows.values()) if (r.id === id) Object.assign(r, patch);
    },
    async smsByProviderId(provider, sid) {
      for (const r of rows.values()) if (r.provider === provider && r.provider_message_id === sid) return r;
      return null;
    },
  };
  const sid = "SM" + "a".repeat(32);
  const fetchImpl = async () => { twilioPosts++; return { ok: true, status: 201, json: async () => ({ sid, status: "queued" }) }; };
  const s1 = await sendGroupPlanSms({ repository: repo, planId: "p1", slotKey: "organizer", kind: "organizer_created", to: "(813) 555-0199", consentText: ORGANIZER_SMS_CONSENT_TEXT, textParams: { placeName: "Ulele", groupUrl: "https://x.test/g" }, env: validEnv, fetchImpl });
  eq(s1, { sent: true, reason: "accepted", sid, status: "queued" }, "first SMS send accepted by Twilio");
  const s2 = await sendGroupPlanSms({ repository: repo, planId: "p1", slotKey: "organizer", kind: "organizer_created", to: "(813) 555-0199", consentText: ORGANIZER_SMS_CONSENT_TEXT, textParams: { placeName: "Ulele", groupUrl: "https://x.test/g" }, env: validEnv, fetchImpl });
  eq(s2.reason, "already", "duplicate send blocked by durable claim");
  eq(twilioPosts, 1, "Twilio called exactly once");

  const cbParams = { AccountSid: validEnv.TWILIO_ACCOUNT_SID, MessageSid: sid, MessageStatus: "delivered" };
  const cbUrl = "https://www.gowayfind.com/api/group-plans/sms-status";
  const sign = (params) => {
    const payload = cbUrl + Object.keys(params).sort().map((k) => k + params[k]).join("");
    return crypto.createHmac("sha1", validEnv.TWILIO_AUTH_TOKEN).update(payload).digest("base64");
  };
  eq((await applyGroupSmsStatusCallback({ repository: repo, params: cbParams, env: validEnv, signature: "bad", url: cbUrl })).code, "BAD_SIGNATURE", "rejects forged Twilio signature");
  eq((await applyGroupSmsStatusCallback({ repository: repo, params: cbParams, env: validEnv, signature: sign(cbParams), url: cbUrl })), { ok: true, status: "delivered" }, "accepts verified delivered callback");
  const backwards = { AccountSid: validEnv.TWILIO_ACCOUNT_SID, MessageSid: sid, MessageStatus: "sent" };
  eq((await applyGroupSmsStatusCallback({ repository: repo, params: backwards, env: validEnv, signature: sign(backwards), url: cbUrl })), { ok: true, status: "delivered", unchanged: true }, "status transitions only move forward");
}

// 5. End-to-end service: autoStart + organizer SMS + groupToken join_respond + delete/clean/dismiss
{
  const NOW = Date.parse("2026-11-23T18:00:00Z");
  const store = new Map(), optIns = new Map(), smsCalls = [];
  let seq = 0;
  const nextUuid = () => `10000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const repo = {
    async rateLimit() {},
    async findCreated() { return null; },
    async create({ state, secret, emailConsent }) {
      const row = { id: state.id, owner_id: state.ownerId, status: state.status, revision: state.revision, deadline: state.deadline, expires_at: "2027-01-01T00:00:00Z", invite_secret: secret, email_consent: emailConsent, state, created_at: new Date(NOW).toISOString() };
      store.set(row.id, row);
      return row;
    },
    async get(id) { return store.get(id) || null; },
    async compareAndSwap(id, rev, next) {
      const cur = store.get(id);
      if (!cur || cur.revision !== rev) return { conflict: true };
      const updated = { ...cur, state: next, status: next.status, revision: next.revision };
      store.set(id, updated);
      return updated;
    },
    async saveSmsOptIn({ planId, slotKey, phone, consentText }) {
      const list = optIns.get(planId) || [];
      list.push({ slot_key: slotKey, phone, consent_text: consentText });
      optIns.set(planId, list);
    },
    async listSmsOptIns(planId) { return optIns.get(planId) || []; },
    async notices() { return [{ id: "n1", plan_id: [...store.keys()][0], event_type: "voting_closed", email_status: "none" }]; },
    async listOwned(uid) { return [...store.values()].filter((r) => r.owner_id === uid); },
    async deletePlan(id, uid) { const r = store.get(id); if (!r || r.owner_id !== uid) return false; store.delete(id); return true; },
    async cleanHistory(_uid, scope) { return { deleted_plans: scope === "all" ? store.size : 0 }; },
    async dismissNotice() { return true; },
  };
  const placeData = {
    async prepareSelected(ids) { return { places: ids.map((id, i) => ({ id, name: i === 0 ? "Ulele" : "Riverwalk Cruise", status: "OPERATIONAL" })), alternativesStatus: "custom" }; },
    async hydrate(ids) { return ids.map((id) => ({ id, name: id === "ChIJ1" ? "Ulele" : "Riverwalk Cruise", status: "OPERATIONAL", openTimeIds: ["10000000-0000-4000-8000-000000000002"], closedTimeIds: [], unverifiedTimeIds: [] })); },
  };
  const svc = createGroupPlanService({
    repository: repo, placeData, clock: () => NOW, uuid: nextUuid, secret: () => "a".repeat(64),
    smsAvailable: true,
    smsSender: async (args) => { smsCalls.push(args); return { sent: true, reason: "accepted" }; },
  });
  const owner = { id: "owner-1", hasVerifiedEmail: false };
  const created = await svc.create({
    createKey: "99999999-0000-4000-8000-000000000001",
    originalPlaceId: "ChIJ1",
    selectedPlaceIds: ["ChIJ1", "vx_11P1"],
    organizerName: "Gabriel",
    shareMode: "group",
    openGroup: true,
    autoStart: true,
    invitees: [],
    times: [{ startsAt: "2026-11-28T23:00:00.000Z", endsAt: null }],
    deadline: "2026-11-26T23:00:00.000Z",
    timeZone: "America/New_York",
    organizerPhone: "(813) 555-0199",
    organizerSmsConsent: true,
  }, owner);
  eq(created.status, "open", "autoStart opens vote immediately");
  ok(created.groupToken, "organizer receives single groupToken");
  eq(created.organizerSmsTail, "99", "organizer sees masked last 2 of opted-in phone");
  eq(smsCalls.length, 1, "organizer receives immediate creation text with link");
  eq(smsCalls[0].kind, "organizer_created", "creation text uses organizer_created kind");

  // Voter joins via groupToken, receives slotToken and saves optional voter SMS opt-in.
  const joined = await svc.command(created.id, {
    id: "99999999-0000-4000-8000-000000000002",
    type: "join_respond",
    guestName: "Maya",
    placeId: "vx_11P1",
    availableTimeIds: [created.times[0].id],
    declined: false,
    voterPhone: "(813) 555-0122",
    voterSmsConsent: true,
  }, { groupToken: created.groupToken });
  ok(joined.slotToken, "join_respond returns personal slotToken for voter edits");
  eq(joined.invitee.name, "Maya", "voter sees their own receipt");
  eq(joined.status, "open", "openGroup stays open for more friends to vote");

  // Group token cannot execute organizer commands.
  await assert.rejects(() => svc.command(created.id, { id: "99999999-0000-4000-8000-000000000003", type: "close" }, { groupToken: created.groupToken }), /cannot perform/i);
  assertions++;

  // Hydrated notices & delete.
  const listed = await svc.notices(owner);
  eq(listed.plans[0].title, "Ulele + 1 more", "history list hydrates real spot title");
  eq(listed.notices[0].planTitle, "Ulele + 1 more", "updates inherit real spot title");
  eq((await svc.deletePlan(created.id, owner)).deleted, true, "owner deletes plan from history");
}

// 6. Native Wayfind styling (ZERO purple/lavender/teal literals!) + simplified UI checks
for (const file of ["GroupFrame.js", "GroupOrganizer.js", "GroupBallot.js", "GroupPlaceOptions.js", "GroupPlanClient.js"]) {
  const src = readFileSync(path.join(ROOT, "app/group-plans", file), "utf8");
  absent(src, /#130b23|#211333|#cfb2ff|#00e3ca|#28163e|#241538|#a88acb|--gp-lavender|--gp-teal/i, `${file} contains zero purple/lavender/teal overrides`);
}
matches(readFileSync(path.join(ROOT, "app/group-plans/GroupFrame.js"), "utf8"), /C\.bg/, "positive control: GroupFrame uses canonical C palette");

const UI = await loadComponent(path.join(ROOT, "app/group-plans/GroupPlanClient.js"), ROOT);
{
  const NOW = "2026-11-23T18:00:00.000Z";
  const plan = applyGroupPlanCommand(createGroupPlan({
    ownerId: "owner-1", organizerName: "gabriel", originalPlaceId: "p1",
    places: [{ id: "p1", name: "Ulele" }, { id: "vx_11P1", name: "Sunset Cruise", kind: "experience" }],
    shareMode: "group", openGroup: true, invitees: [],
    times: [{ startsAt: "2026-11-28T23:00:00.000Z", endsAt: null }],
    deadline: "2026-11-26T23:00:00.000Z", timeZone: "America/New_York",
  }, { now: NOW, id: "p-ui", slotIds: [], timeIds: ["t1"] }), { id: "s1", type: "start" }, { now: NOW });
  const grpHtml = renderToStaticMarkup(React.createElement(UI.GroupBallot, { plan: { ...groupPlanView(plan, { now: NOW }), role: "group", smsAvailable: true }, onCommand() {}, busy: false }));
  matches(grpHtml, /Gabriel started a group vote/, "capitalizes lowercase organizer name");
  matches(grpHtml, /Your first name/, "group-link ballot asks for voter's first name");
  matches(grpHtml, new RegExp(PARTICIPANT_SMS_CONSENT_TEXT.slice(0, 30)), "ballot shows optional voter SMS opt-in when enabled");

  const orgView = { ...organizerPlanView(plan, { now: NOW }), role: "organizer", groupToken: "fixture-group-tok", organizerSmsTail: "99", invites: [] };
  const orgHtml = renderToStaticMarkup(React.createElement(UI.GroupOrganizer, { plan: orgView, onCommand() {}, onDelete() {}, busy: false }));
  matches(orgHtml, /Send one text to your whole group/, "organizer shows 1-tap group texting");
  matches(orgHtml, /href="sms:\?&amp;body=/, "1-tap text uses sms: URI with prefilled message");
  matches(orgHtml, /Santa’s text \(optional\)/, "organizer offers optional Santa message toggle");
  matches(orgHtml, /Text updates on · ••99/, "organizer sees masked SMS update badge");
  matches(orgHtml, /Delete from history/, "organizer page exposes delete from history");

  const formSmsHtml = renderToStaticMarkup(React.createElement(UI.GroupCreateForm, { placeId: "p1", placeName: "Ulele", session: {}, smsAvailable: true, onCreated() {} }));
  matches(formSmsHtml, /Your mobile number/, "create form offers organizer mobile input when SMS enabled");
  matches(formSmsHtml, new RegExp(ORGANIZER_SMS_CONSENT_TEXT.slice(0, 30)), "create form shows explicit organizer SMS consent copy");
}

// 7. Rich 1200x630 Group Vote text-message OG share card (never a bare favicon)
{
  const generic = groupVoteModel({});
  eq(generic.tone, "group", "generic group card wears Wayfind group tone");
  eq(generic.cta, "PICK YOUR PLAN", "generic group card has clear CTA");
  ok(generic.fitted && footFits(generic.foot), "generic group card fits Archivo plate and foot budget");
  const named = groupVoteModel({ title: "Ulele", loc: "Tampa", n: 3 });
  ok(named.fitted && footFits(named.foot), "named group card fits plate and foot budget");
  matches(named.lines.join(" "), /Ulele/, "named group card features the lead spot");
  matches(named.eyebrow, /GROUP VOTE/, "eyebrow labels Group Vote");
  const locked = groupVoteModel({ title: "Ulele", purpose: "group_final" });
  eq(locked.cta, "SEE THE PLAN", "finalized group card switches CTA to SEE THE PLAN");
  ok(locked.fitted && footFits(locked.foot), "finalized group card fits plate and foot budget");
  eq(heroFallbackModel({ kind: "list", title: "Sunset Cruise", purpose: "group" }).tone, "group", "tour/list hero fallback uses rich group card");
  for (const rel of ["app/group-plans/[id]/page.js", "app/group-plans/page.js", "app/group-plans/new/page.js"]) {
    const pageSrc = readFileSync(path.join(ROOT, rel), "utf8");
    matches(pageSrc, /\/api\/og\?kind=group/, `${rel} always supplies /api/og?kind=group fallback image`);
    matches(pageSrc, /openGraph:/, `${rel} emits openGraph metadata`);
    matches(pageSrc, /width:1200,height:630/, `${rel} declares 1200x630 OG card dimensions`);
  }
}

console.log(`test-group-vote-overhaul PASS: ${assertions} assertions`);
