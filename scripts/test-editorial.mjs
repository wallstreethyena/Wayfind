// scripts/test-editorial.mjs — v6.38 offline tests for the editorial notes
// data + resolver (lib/editorial.js). No network: pure data integrity.
import E, { editorialFor, editorialNorm, EDITORIAL_COUNT } from "../lib/editorial.js";

let pass = 0;
const fail = (m) => { console.error("test-editorial: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const keys = Object.keys(E);
ok(keys.length >= 280, `at least 280 unique places (got ${keys.length})`);
ok(EDITORIAL_COUNT === keys.length, "EDITORIAL_COUNT matches the data");

// Sourced-fields-only exception: Sarasota Medieval Fair is a name-keyed
// event note (knownFor + why only). Do not invent vibe/move to satisfy
// the three-part place-voice loop — that is the product decision.
const SOURCED_ONLY = new Set(["sarasota medieval fair"]);

// every place entry carries the full three-part voice, substantively
for (const k of keys) {
  const e = E[k];
  ok(e && e.name, `entry ${k} has a name`);
  if (SOURCED_ONLY.has(k)) {
    ok(typeof e.knownFor === "string" && e.knownFor.trim().length >= 20, `${e.name}: sourced knownFor`);
    ok(typeof e.why === "string" && e.why.trim().length >= 20, `${e.name}: sourced why`);
    for (const f of ["vibe", "move", "foodMove", "story"]) {
      ok(!e[f], `${e.name}: no invented ${f}`);
    }
    continue;
  }
  for (const f of ["vibe", "why", "move"]) {
    ok(typeof e[f] === "string" && e[f].trim().length >= 20, `${e.name}: "${f}" is substantive`);
  }
}

// normalization round-trips: every stored key resolves to itself
for (const k of keys.slice(0, 50)) ok(editorialNorm(E[k].name) === k, `key round-trip for ${E[k].name}`);

// exact lookups across both source docs + both metros
ok(editorialFor("The Ringling"), "The Ringling resolves (SWFL doc)");
ok(editorialFor("Kojo"), "Kojo resolves (Sarasota)");
ok(editorialFor("Columbia Restaurant"), "Columbia resolves (Tampa/Ybor)");
ok(editorialFor("Sunroom"), "Sunroom resolves (Central Florida doc)");

// fuzzy: Google's longer official names still match by prefix either way
const ring = editorialFor("The Ringling Museum of Art");
ok(ring && /Ringling/.test(ring.name), "longer Google name prefix-matches The Ringling");

// v6.38 — the enhanced publish-ready Atlas cards carry the deeper fields
const agave = editorialFor("Agave Bandido");
ok(agave && /Guacamole/i.test(agave.foodMove || ""), "Agave Bandido carries its Food Move (Guacamole Flight)");
ok(agave && (agave.drinkMove || "").length >= 20, "Agave Bandido carries a Drink Move");
const asolo = editorialFor("Asolo Repertory Theatre");
ok(asolo && (asolo.knownFor || "").length >= 20, "Asolo carries Known For");
ok(asolo && (asolo.story || "").length >= 20, "Asolo carries its Verified Story");
const selby = editorialFor("Marie Selby Botanical Gardens");
ok(selby && (selby.insiderMove || selby.move || "").length >= 20, "Selby carries an Insider Move");
const artov = editorialFor("Art Ovation Hotel, Autograph Collection");
ok(artov && (artov.drinkMove || "").length >= 20, "Art Ovation carries a Drink Move (Perspective rooftop)");
const oyster = editorialFor("Anna Maria Oyster Bar");
ok(oyster && (oyster.foodMove || "").length >= 20, "AMOB carries a Food Move (oyster sampler)");

// negatives: unknown places return null, never a wrong entry
ok(editorialFor("Some Nonexistent Diner 9000") === null, "unknown name -> null");
ok(editorialFor("") === null, "empty name -> null");

// name-keyed event note (owner-approved, 2026-08-20): /api/editorial
// looks this up by event name. Verbatim sourced fields only.
const FAIR_KNOWN = "Twice-daily full-armored joust, on the tournament field";
const FAIR_WHY = "Sarasota Medieval Fair holds Full-Armored Jousting Tournaments twice daily, on the tournament field in the Woods of Mallaranny. Official welcome still dates this 47-acre woodland village Saturday–Sunday, November 7 through December 6.";
const fair = editorialFor("Sarasota Medieval Fair");
ok(fair && fair.knownFor === FAIR_KNOWN, "Sarasota Medieval Fair returns the verbatim sourced knownFor");
ok(fair && fair.why === FAIR_WHY, "Sarasota Medieval Fair returns the verbatim sourced why");
ok(editorialFor("Sarasota Medieval Fair 2026") === fair,
  "year-suffixed event name prefix-matches the same note");
ok(editorialNorm("Sarasota Medieval Fair") === "sarasota medieval fair",
  "the stored key is editorialNorm of the event name");

console.log(`test-editorial: OK — ${pass} assertions (${keys.length} places incl. enhanced Atlas cards, lookup exact+fuzzy)`);
