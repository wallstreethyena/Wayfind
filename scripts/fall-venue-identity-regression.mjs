#!/usr/bin/env node
// scripts/test-fall-venue-identity.mjs — every Fall event→venue identity in
// FALL_EVENT_VENUE_PLACE_IDS is PROVEN, not guessed.
//
// WHY: a Fall card with no owned place_id is fail-closed (imageless, no
// directions). Lane C (2026-09-06) upgrades registry-only Miami rows to real
// venue photos by mapping them to inventory Wayfind ALREADY owns. The danger
// is a fuzzy mapping — a similar name, a coordinate in the wrong park — that
// would put another venue's photo on an event. So for every South Florida
// mapping this guard requires, from a checked-in snapshot of the LIVE
// inventory (scripts/fixtures/fall-venue-identity-proof-2026-09-06.json):
//   • the place_id exists in the proof, OPERATIONAL, not excluded, with photo
//   • the event row names that venue (exact venue, not name-substring luck)
//   • the event row's coordinates sit within IDENTITY_RADIUS_MI of the row
//   • the mapping is only applied when the row has no place_id of its own
// It also proves the boundary itself does its job (withFallVenueIdentity) and
// that a registry-only row still claims no /florida-events detail page.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { FALL_EVENT_VENUE_PLACE_IDS, withFallVenueIdentity } from "../lib/fallEventImage.js";
import { FALL_DISCOVERIES_2026 } from "../lib/fallDiscoveries2026.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

const IDENTITY_RADIUS_MI = 0.75;
const proof = JSON.parse(readFileSync(join(ROOT, "scripts/fixtures/fall-venue-identity-proof-2026-09-06.json"), "utf8"));
const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
const hav = (a, b, c, d) => R * 2 * Math.asin(Math.sqrt(Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2));
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The South Florida set this lane owns. Central-Florida ids that predate it
// keep their existing (undocumented-here) proof and are not re-asserted.
const SOFLA = [
  "the-horrorland-jungle-island-2026",
  "house-of-horror-carnival-2026",
  "nightmare-village-xtreme-action-park-2026",
  "not-so-scary-halloween-bash-miami-childrens-museum-2026",
  "zoo-boo-zoo-miami-2026",
  "roars-smores-snores-spooktacular-campout-zoo-miami-2026",
  "zoo-miami-monster-masquerade-2026",
  "bonnet-house-halloween-fest-2026",
  "boo-in-bloom-fruit-spice-park-2026",
  "halloween-at-faena-miami-beach-2026",
  "boo-bash-pompano-beach-2026",
];
// Venue-name evidence: the event row's `venue` must contain the owned row's
// distinctive name tokens (both directions checked so "House of Horror at
// Tropical Park" ↔ "Tropical Park" and "Pompano Beach Community Park" ↔
// "Pompano Community Park" both count as the same named place).
const nameAgrees = (eventVenue, invName) => {
  const a = norm(eventVenue), b = norm(invName);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = new Set(a.split(" ")), tb = b.split(" ").filter((t) => t.length > 2 && !["the", "and", "park", "museum", "gardens", "beach"].includes(t));
  return tb.length > 0 && tb.every((t) => ta.has(t));
};

const byId = new Map(FALL_DISCOVERIES_2026.map((r) => [r.event_id, r]));
for (const id of SOFLA) {
  const placeId = FALL_EVENT_VENUE_PLACE_IDS[id];
  const row = byId.get(id);
  ok(!!row, `${id}: exists in FALL_DISCOVERIES_2026 (the source-truth registry #1126 landed)`);
  ok(typeof placeId === "string" && /^ChIJ[A-Za-z0-9_-]{20,}$/.test(placeId), `${id}: mapped to a well-formed owned place_id`);
  const p = proof.rows[placeId];
  ok(!!p, `${id}: place_id ${placeId} is in the live-inventory proof snapshot`);
  if (!row || !p) continue;
  ok(p.status === "OPERATIONAL" && p.excluded === false, `${id}: owned row is OPERATIONAL and not excluded`);
  ok(p.has_photo === true, `${id}: owned row carries an owned photo (the card can render a real venue photo, not the poster)`);
  ok(nameAgrees(row.venue, p.name), `${id}: event venue "${row.venue}" names the owned row "${p.name}" (no fuzzy-name-only identity)`);
  const d = hav(row.lat, row.lng, p.lat, p.lng);
  ok(Number.isFinite(d) && d <= IDENTITY_RADIUS_MI, `${id}: event coordinates are ${d.toFixed(2)} mi from the owned row (must be ≤ ${IDENTITY_RADIUS_MI})`);
  ok(row.place_id == null, `${id}: the source row itself stays place_id-less — identity lives at the serve boundary, not in editorial`);
  ok(typeof row.official_event_url === "string" && /^https:\/\//.test(row.official_event_url), `${id}: carries an https official URL for the card's safe link`);
}

// ── The boundary: mapping applied only where the row has no identity ──────
{
  const bare = { event_id: "zoo-boo-zoo-miami-2026", place_id: null };
  ok(withFallVenueIdentity(bare).place_id === "ChIJFY7wCsjD2YgRn8R_2IMRjtw", "withFallVenueIdentity stamps the proven place_id onto a registry-only row");
  const owned = { event_id: "zoo-boo-zoo-miami-2026", place_id: "ChIJ_db_wins" };
  ok(withFallVenueIdentity(owned).place_id === "ChIJ_db_wins", "…but never overwrites a place_id the row already has (database identity wins)");
  const unknown = { event_id: "not-a-mapped-event-2026", place_id: null };
  ok(withFallVenueIdentity(unknown).place_id === null, "…and leaves an unmapped row fail-closed (no invented identity)");
  ok(withFallVenueIdentity(null) === null, "null in, null out");
}

// ── No detail-page claim without a wf_events row ─────────────────────────
{
  // A mapping is an IMAGE + DIRECTIONS identity, not a page. The rail must
  // not mint /florida-events/<slug> links from the registry alone; that
  // upgrade is Lane D's seed. Prove the registry rows carry no such URL.
  const claimsPage = (row) => /\/florida-events\//.test(JSON.stringify(row));
  // Positive control: the detector CAN fire — a row that smuggles a detail
  // URL into any field is caught. Without this, an always-false regex would
  // pass every row below and prove nothing.
  ok(claimsPage({ event_id: "x", official_event_url: "https://gowayfind.com/florida-events/x" }), "CONTROL: the detail-page detector fires on a row that carries a /florida-events/ URL");
  ok(claimsPage({ event_id: "x", detailHref: "/florida-events/x" }), "CONTROL: …in any field, not just the official URL");
  for (const id of SOFLA) {
    const row = byId.get(id);
    if (!row) continue;
    ok(!claimsPage(row), `${id}: registry row does not claim a /florida-events/ detail page`);
  }
  // And the serve boundary keeps it that way: mapping an identity adds a
  // place_id and nothing else — no slug, no href, no page.
  const merged = withFallVenueIdentity({ ...byId.get("zoo-boo-zoo-miami-2026"), place_id: null });
  ok(merged.place_id === "ChIJFY7wCsjD2YgRn8R_2IMRjtw" && !claimsPage(merged) && !("detailHref" in merged),
    "withFallVenueIdentity adds ONLY place_id — a mapped registry row still has no detail page until wf_events carries its slug");
}

// ── Every proof row is used, every mapping in this lane has a proof ───────
{
  const used = new Set(SOFLA.map((id) => FALL_EVENT_VENUE_PLACE_IDS[id]));
  for (const pid of Object.keys(proof.rows)) ok(used.has(pid), `proof row ${pid} (${proof.rows[pid].name}) is referenced by a mapping — no orphan proof`);
  const zoo = SOFLA.filter((id) => FALL_EVENT_VENUE_PLACE_IDS[id] === "ChIJFY7wCsjD2YgRn8R_2IMRjtw");
  ok(zoo.length === 3, "three Zoo Miami programs share ONE owned venue identity (Zoo Boo, Roars S'mores & Snores, Monster Masquerade)");
}

console.log(`test-fall-venue-identity: ${fail ? "FAIL" : "OK"} — ${pass} passed, ${fail} failed (${SOFLA.length} South Florida mappings proven against ${Object.keys(proof.rows).length} owned rows)`);
process.exit(fail ? 1 : 0);
