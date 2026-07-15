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

// ── Ships dark: with NO live Travelpayouts program there is no target ──────────
ok(Mz.bookItTarget(attraction, { available: [], city: "Sarasota" }) === null, "no live program → no target (dark)");
ok(Mz.bookItTarget(attraction, {}) === null, "missing available → no target (dark)");
// The real production guarantee: no program is live in code (ids unset), and
// tpDeepLink refuses to build a link — so nothing can render in prod today.
ok(Tp.isTpProgramLive("tiqets") === false && Tp.isTpProgramLive("klook") === false, "no TP program is live in code (ids unset)");

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

// ── End-to-end dark: even a real target yields no tracked link until ids exist ─
ok(Tp.tpDeepLink("tiqets", t.url, "place123") === null, "tpDeepLink is null until program ids exist → the component renders nothing in prod");

if (fails) { console.error(`test-book-it: ${fails} failure(s)`); process.exit(1); }
console.log("test-book-it: OK — Book-it ships dark, resolves the right provider when live, never duplicates Viator, never wraps non-bookable places");
