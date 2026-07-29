// Gate: the detail-sheet "Book it" affiliate target (lib/monetize.js bookItTarget)
// ships DARK, resolves the right provider only when a program is supplied live,
// never duplicates the Viator CTA, and never wraps non-bookable inventory.
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "wf-bookit-"));
for (const f of ["monetize", "travelpayouts"]) copyFileSync(`lib/${f}.js`, join(tmp, `${f}.mjs`));
const Mz = await import(join(tmp, "monetize.mjs"));
const Tp = await import(join(tmp, "travelpayouts.mjs"));

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("test-book-it: FAIL — " + m); fails++; } };

const attraction = { name: "The Ringling", types: ["museum", "art_gallery"] };
const tour = { name: "Sarasota Bay Kayak Tour", types: ["travel_agency"] };
const restaurant = { name: "Owen's Fish Camp", types: ["restaurant"] };
const beach = { name: "Siesta Key Beach", types: ["natural_feature"] };
const hotel = { name: "The Ritz-Carlton", types: ["lodging"] };

// ── Dark WITHOUT an offer — still the guarantee, and it is now the only one ───
// Until 2026-07-29 this file also asserted that NO TP program was live, because
// every promoId/campaignId was null. Four Wave-1 programs are now lit, so that
// assertion described the outage rather than the contract. What survives is the
// real invariant: no offer available -> no target, regardless of program state.
ok(Mz.bookItTarget(attraction, { available: [], city: "Sarasota" }) === null, "no offer available → no target (dark)");
ok(Mz.bookItTarget(attraction, {}) === null, "missing available → no target (dark)");
// Wave 1 is live; everything else must still be dark. Both directions asserted —
// a check that only proves what is ON cannot catch a program lighting up early.
ok(Tp.isTpProgramLive("tiqets") === true && Tp.isTpProgramLive("klook") === true, "Wave-1 tiqets + klook are LIVE");
ok(Tp.isTpProgramLive("gocity") === false && Tp.isTpProgramLive("tripadvisorexperiences") === false, "Wave-2 and in-review programs are still DARK");

// ── When a program IS supplied live, a bookable place resolves to it ──────────
const t = Mz.bookItTarget(attraction, { available: ["tiqets"], city: "Sarasota" });
ok(t && t.provider === "tiqets" && /tiqets\.com/.test(t.url), "bookable attraction + live tiqets → tiqets target with a real url");
ok(t && t.label && /commission/i.test(t.label.sub), "target carries the required disclosure label");
ok(!!Mz.bookItTarget(tour, { available: ["wegotrip"] }), "a guided tour + live wegotrip → a target");

// ── Never wraps non-bookable inventory ────────────────────────────────────────
ok(Mz.bookItTarget(restaurant, { available: ["tiqets"] }) === null, "restaurant → no target");
ok(Mz.bookItTarget(beach, { available: ["tiqets"] }) === null, "free beach → no target");
ok(Mz.bookItTarget(hotel, { available: ["tiqets"] }) === null, "lodging → no target (handled elsewhere)");

// ── Never duplicates the Viator CTA (BookingCTA owns viator/gyg) ──────────────
ok(Mz.bookItTarget(attraction, { available: ["viator"] }) === null, "viator excluded — BookingCTA owns it, never duplicated");
ok(Mz.bookItTarget(attraction, { available: ["gyg"] }) === null, "gyg excluded — Viator family");
ok(Mz.bookItTarget(attraction, { available: ["viator", "tiqets"] })?.provider === "tiqets", "viator filtered out even when mixed with a real TP program");

// ── End-to-end LIVE: a real target now yields a tracked link ─────────────────
const tracked = Tp.tpDeepLink("tiqets", t.url, "place123");
ok(!!tracked, "tpDeepLink builds a tracked link for a resolved target — Book-it can now render");
const tu = new URL(tracked);
ok(tu.origin + tu.pathname === "https://tp.media/r", "Book-it's tracked link uses the tp.media/r endpoint");
ok(tu.searchParams.get("marker") === "750791", "Book-it's link carries the EARNING marker 750791, not the account id");
ok(tu.searchParams.get("trs") === "550160", "…and 550160 only as trs");
ok(tu.searchParams.get("u") === t.url, "the resolved provider url is preserved intact inside the wrapper");
// A dark program must still refuse, even with a perfectly good target.
ok(Tp.tpDeepLink("gocity", t.url, "place123") === null, "a DARK program still returns null for the same target — ships-dark discipline intact");

if (fails) { console.error(`test-book-it: ${fails} failure(s)`); process.exit(1); }
console.log("test-book-it: OK — Book-it renders only with an offer, resolves the right provider, emits tp.media/r with marker 750791, keeps Wave-2 dark, never duplicates Viator, never wraps non-bookable places");
