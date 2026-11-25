// Journey telemetry (2026-11-25): the normalized traffic channel, the returning
// visitor count, campaign preservation across route changes, and the one
// interruption per visit budget. Pure modules with injected storage; no network.
import assert from "node:assert/strict";
import * as A from "../lib/campaignAttribution.js";
import { canInterrupt, claimInterruption, MAX_INTERRUPTIONS_PER_SESSION, INTERRUPTION_KEY } from "../lib/interruptionBudget.js";
import { selectProactivePlannerOffer, recordProactiveShown } from "../lib/plannerProactive.js";
import { shouldFire, _resetDedupe } from "../lib/analytics.js";

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const ok = (v, m) => { assert.ok(v, m); n += 1; };
const mem = () => { const m = new Map(); return { _m: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// ── trafficChannel: every Meta spelling is one channel ────────────────────
const ch = (p, extra = {}) => A.trafficChannel({ p, ct: "", rd: "", ...extra });
for (const src of ["fb", "facebook", "ig", "instagram", "IG", "Instagram", "meta", "threads", "an", "msg"]) eq(ch({ utm_source: src }), "meta", `utm_source=${src} is meta`);
eq(ch({}, { ct: "fbclid" }), "meta", "fbclid alone is meta");
eq(ch({ utm_source: "google", utm_medium: "cpc" }), "google", "google cpc");
eq(ch({}, { ct: "gclid" }), "google", "gclid is google");
eq(ch({}, { ct: "ttclid" }), "tiktok", "ttclid is tiktok");
eq(ch({ utm_source: "tiktok" }), "tiktok", "utm_source tiktok");
eq(ch({ utm_source: "x", utm_medium: "email" }), "email", "medium email");
eq(ch({ utm_source: "calendar", utm_medium: "reminder" }), "campaign", "any other tagged link is campaign");
eq(ch({}, { rd: "l.instagram.com" }), "meta", "instagram link shim referrer is meta");
eq(ch({}, { rd: "m.facebook.com" }), "meta", "facebook referrer is meta");
eq(ch({}, { rd: "www.google.com" }), "google", "google organic referrer");
eq(ch({}, { rd: "www.msn.com" }), "referral", "other site referrer");
eq(ch({}, { rd: "www.gowayfind.com" }), "direct", "our own domain is not a referral");
eq(ch({}), "direct", "nothing is direct");
eq(A.trafficChannel(null), "direct", "no record is direct");
ok(A.TRAFFIC_CHANNELS.includes(ch({ utm_source: "zzz" })), "every result is a documented channel");

// ── capture keeps the landing across client route changes ─────────────────
const local = mem(), session = mem(), T0 = Date.parse("2026-11-25T15:00:00Z");
let st = A.captureLanding({ search: "?utm_source=ig&utm_medium=paid_social&utm_campaign=xmas&utm_content=120252036823830033&fbclid=F1", pathname: "/christmas-in-florida", referrer: "https://l.instagram.com/", local, session, now: T0 });
st = A.captureLanding({ search: "?city=tampa", pathname: "/christmas-in-florida", referrer: "", local, session, now: T0 + 5000 });
st = A.captureLanding({ search: "", pathname: "/p/ChIJabc", referrer: "", local, session, now: T0 + 9000 });
const props = A.attributionProps(st);
eq([props.wf_sess_utm_source, props.wf_sess_utm_campaign, props.wf_sess_channel, props.wf_ft_channel], ["ig", "xmas", "meta", "meta"], "the Instagram landing survives two client navigations, with channel meta");
ok(!("wf_ft_fbclid" in props), "first touch never keeps the click id value");
const lp = A.landingProps(st);
eq([lp.landing_source, lp.landing_channel, lp.landing_content], ["ig", "meta", "120252036823830033"], "commerce click payload carries the channel and the ad id");
const cookie = A.landingCookieValue(st);
const back = A.landingFromCookieHeader("a=1; " + A.ATTR_COOKIE + "=" + cookie + "; b=2");
eq([back.landing_source, back.landing_channel, back.landing_campaign], ["ig", "meta", "xmas"], "the server redirect event reads the channel back from the cookie");
eq(A.landingFromCookieHeader(A.ATTR_COOKIE + "=h~a%40b.com").landing_channel, undefined, "an email shaped cookie value is dropped");

// ── returning visitor: one count per tab session ──────────────────────────
eq(A.visitorProps(local), { wf_visit_number: 1, wf_returning: false }, "first tab session is visit 1");
A.captureLanding({ search: "?utm_source=google", pathname: "/", local, session, now: T0 + 60000 });
eq(A.readVisits(local).n, 1, "a re-landing in the same tab session is not a new visit");
A.captureLanding({ search: "", pathname: "/", local, session: mem(), now: T0 + 86400000 });
eq(A.visitorProps(local), { wf_visit_number: 2, wf_returning: true }, "a new tab session the next day is a returning visit");
eq(A.visitorProps(mem()), {}, "no history, no props");
ok(Object.keys(JSON.parse(local.getItem(A.VISITS_KEY))).sort().join() === "last,n", "the visit record holds only a count and a date");

// ── one interruption per visit ────────────────────────────────────────────
eq(MAX_INTERRUPTIONS_PER_SESSION, 1, "the cap is one");
const s1 = mem();
ok(canInterrupt(s1), "a fresh visit may be interrupted once");
ok(claimInterruption(s1, "promo_sheet"), "the first claim succeeds");
ok(!canInterrupt(s1) && !claimInterruption(s1, "planner_place"), "a second interruption in the same visit is refused");
eq(selectProactivePlannerOffer({ pathname: "/p/ChIJabc", storage: s1 }), null, "the planner offer stays hidden once another surface used the visit's interruption");
const s2 = mem();
const offer = selectProactivePlannerOffer({ pathname: "/p/ChIJabc", storage: s2 });
ok(offer && offer.kind === "place", "the planner offer shows on a fresh visit");
recordProactiveShown(s2, offer.kind);
ok(!canInterrupt(s2) && JSON.parse(s2.getItem(INTERRUPTION_KEY)).kind === "planner_place", "showing the planner offer spends the visit's interruption");
eq(selectProactivePlannerOffer({ pathname: "/christmas-in-florida", storage: s2 }), null, "no second offer of another kind in the same visit");
ok(!canInterrupt(null) && !claimInterruption(null, "x"), "no storage fails closed");
const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
ok(!canInterrupt(broken) && !claimInterruption(broken, "x"), "a throwing storage fails closed");
const full = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
ok(!claimInterruption(full, "x"), "a full storage cannot record a claim, so it reports none");

// ── duplicate suppression for outbound events (lib/analytics.js) ──────────
_resetDedupe();
ok(shouldFire("tickets_out|ChIJabc", 1000) && !shouldFire("tickets_out|ChIJabc", 1500) && shouldFire("tickets_out|ChIJabc", 2600), "a double tap inside 1.5s fires once; a later tap fires again");

console.log(`test-journey-telemetry: OK (${n} assertions)`);
