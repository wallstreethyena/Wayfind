// Gate: the detail-sheet "Book it" affiliate target (lib/monetize.js bookItTarget)
// ships DARK, resolves the right provider only when a program is supplied live,
// never duplicates the Viator CTA, and never wraps non-bookable inventory.
import { readFileSync } from "node:fs";
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
ok(Tp.isTpProgramLive("gocity") === true && Tp.isTpProgramLive("kiwitaxi") === false && Tp.isTpProgramLive("tripadvisorexperiences") === false, "Go City is live; transfers and in-review programs stay DARK");

// ── When a VERIFIED program is supplied live, a bookable place resolves ──────
// The probe place is an EVENT VENUE, not an attraction, because ticketnetwork is
// the only provider whose search path has been loaded in a browser and seen to
// return correct, local results. This block used to probe tiqets; it asserted the
// target resolved, which stayed true while the URL it produced 404'd.
const venue = { name: "LECOM Park", types: ["stadium"] };
const t = Mz.bookItTarget(venue, { available: ["ticketnetwork"], city: "Bradenton" });
ok(t && t.provider === "ticketnetwork" && /ticketnetwork\.com/.test(t.url), "event venue + live ticketnetwork → a target with a real url");
ok(t && t.label && /commission/i.test(t.label.sub), "target carries the required disclosure label");

// ── A LIVE PROGRAM WITH NO VERIFIED SEARCH PATH MUST SHIP DARK ───────────────
// THE BUG THIS LOCKS. tiqets/wegotrip/klook sat in SEARCH_URL carrying "TODO
// verify" comments. A comment gates nothing: when NEXT_PUBLIC_BOOK_IT flipped to
// "on" (2026-07-29) all three went live unverified, and on 2026-07-30 a browser
// showed what they actually served —
//   wegotrip  /search?q=… -> 302 -> /search/?q=… -> hard 404, no search endpoint
//   tiqets    /en/search/?q=… -> 404; and the slash-less path returns results
//             in VIENNA for a Sarasota museum, i.e. the geo-mismatch class
//             geoConfirms() exists to stop — worse than a 404, it looks like a
//             working recommendation
//   klook     403 to every fetcher, so unverifiable in either direction
// Being LIVE in TP_PROGRAMS is therefore NOT sufficient to render. A provider must
// also have a browser-verified search path recorded in lib/monetize.js.
for (const key of ["tiqets", "wegotrip", "klook", "gocity"]) {
  ok(Tp.isTpProgramLive(key) === true, `${key} is a LIVE TP program (so this check is not vacuous — it must be dark DESPITE being live)`);
  ok(Mz.bookItTarget(venue, { available: [key], city: "Bradenton" }) === null,
    `${key} has NO verified search path → ships DARK even though its tracking ids are live. An FTC-labeled sponsored link to a 404, or to another continent's inventory, is worse than no link.`);
  ok(Mz.bookItTarget(attraction, { available: [key], city: "Sarasota" }) === null,
    `${key} is dark for attractions too — the category does not rescue an unverified destination`);
}
// Every builder that exists must carry MACHINE-READABLE verification evidence.
{
  const src = readFileSync("lib/monetize.js", "utf8");
  // Marker check runs on CODE ONLY. The prose above the map legitimately explains
  // why "TODO verify" is not a gate, and matching that explanation would be a guard
  // that punishes documenting the very defect it locks.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(code.length > 500, `stripped comments and still have code (got ${code.length}) — an over-eager strip would make the next check vacuous`);
  ok(!/TODO\s*verify/i.test(code),
    "no SEARCH_URL entry carries a 'TODO verify' marker in code — that marker gated nothing and shipped three unverified links the moment the master switch flipped");

  const keys = Object.keys(Mz.MONETIZE_INTERNALS.SEARCH_URL);
  ok(keys.length >= 2, `SEARCH_URL has entries to check (got ${keys.length}) — an empty map would make this vacuous`);
  for (const k of keys) {
    const v = Mz.SEARCH_URL_VERIFIED[k];
    ok(!!v, `${k} has a SEARCH_URL_VERIFIED record — a builder with no recorded browser check must not exist`);
    if (!v) continue;
    ok(/^\d{4}-\d{2}-\d{2}$/.test(String(v.checkedOn)), `${k}: records the date a browser loaded it (got ${JSON.stringify(v.checkedOn)})`);
    ok(v.status === 200, `${k}: the probe returned 200 (got ${JSON.stringify(v.status)})`);
    ok(v.localResults === true,
      `${k}: the probe returned results in the RIGHT METRO. A 200 whose results are on another continent is worse than a 404 — it looks like a working recommendation, which is the geo-mismatch class geoConfirms() exists to stop.`);
    ok(typeof v.saw === "string" && v.saw.length > 12, `${k}: records what was actually on the page`);
  }
  // And the converse: a provider we rejected must NOT have acquired a record.
  for (const k of ["tiqets", "wegotrip", "klook", "gocity"]) {
    ok(!Mz.SEARCH_URL_VERIFIED[k], `${k} has no verification record — it was rejected on evidence, so a record without a re-check would be a lie`);
  }
}

// ── Never wraps non-bookable inventory ────────────────────────────────────────
ok(Mz.bookItTarget(restaurant, { available: ["ticketnetwork"] }) === null, "restaurant → no target");
ok(Mz.bookItTarget(beach, { available: ["ticketnetwork"] }) === null, "free beach → no target");
ok(Mz.bookItTarget(hotel, { available: ["ticketnetwork"] }) === null, "lodging → no target (handled elsewhere)");

// ── Never duplicates the Viator CTA (BookingCTA owns viator/gyg) ──────────────
ok(Mz.bookItTarget(attraction, { available: ["viator"] }) === null, "viator excluded — BookingCTA owns it, never duplicated");
ok(Mz.bookItTarget(attraction, { available: ["gyg"] }) === null, "gyg excluded — Viator family");
ok(Mz.bookItTarget(venue, { available: ["viator", "ticketnetwork"] })?.provider === "ticketnetwork", "viator filtered out even when mixed with a real TP program");

// ── End-to-end LIVE: a real target now yields a tracked link ─────────────────
const tracked = Tp.tpDeepLink("ticketnetwork", t.url, "place123");
ok(!!tracked, "tpDeepLink builds a tracked link for a resolved target — Book-it can now render");
const tu = new URL(tracked);
ok(tu.origin + tu.pathname === "https://tp.media/r", "Book-it's tracked link uses the tp.media/r endpoint");
ok(tu.searchParams.get("marker") === "750791", "Book-it's link carries the EARNING marker 750791, not the account id");
ok(tu.searchParams.get("trs") === "550160", "…and 550160 only as trs");
ok(tu.searchParams.get("u") === t.url, "the resolved provider url is preserved intact inside the wrapper");
// A dark program must still refuse, even with a perfectly good target.
ok(Tp.tpDeepLink("kiwitaxi", t.url, "place123") === null, "a DARK program still returns null for the same target — ships-dark discipline intact");

if (fails) { console.error(`test-book-it: ${fails} failure(s)`); process.exit(1); }
console.log("test-book-it: OK — Book-it renders only with an offer, resolves the right provider, emits tp.media/r with marker 750791, keeps Wave-2 dark, never duplicates Viator, never wraps non-bookable places");
