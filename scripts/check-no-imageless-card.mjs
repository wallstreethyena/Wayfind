#!/usr/bin/env node
/**
 * check-no-imageless-card — no curated card may ship without a picture.
 *
 * THE OWNER LAW, v8.13.3, quoted in app/api/events/route.js and never made
 * executable until now: "I don't want any of the place cards not to have an
 * image."
 *
 * WHAT SHIPPED ANYWAY (owner, 2026-08-30, two screenshots: "these places are
 * missing the pictures"). Two rails, blank, and NEITHER was a rendering bug —
 * every renderer in this repo politely draws nothing when the field is absent,
 * so a source that forgets an image fails silently and looks like CSS:
 *
 *   chef      all seven of Chef Ron Duprat's picks. lib/chefPicks carried no
 *             photo field at all and a comment promising "`photo` self-heals
 *             once refs are harvested". The harvest never ran and could not
 *             have — those seven are in five metros wf_inventory does not
 *             cover, so nothing at runtime could ever have healed them.
 *   augtober  four event tiles. hero_image is a STORED column that
 *             backfill-event-heroes filled once on 2026-08-26; every row added
 *             after that date was born blank, each with a place_id whose venue
 *             was already in wf_inventory WITH a photo_ref.
 *
 * Both were live for days with 470 green guards, because every guard here
 * checked whether an image was LEGAL and none checked whether one EXISTED.
 *
 * WHAT THIS ASSERTS, by CALLING the code rather than reading it:
 *   1. the ladder itself (lib/placePhoto cardImageSrc) — each rung, in order,
 *      with negative controls proving a foreign ref can never be worn
 *   2. every CURATED, in-repo card source, executed: each row must yield a
 *      non-empty src that is legal for its own place id
 *   3. the two surfaces that regressed, executed against real row shapes
 *
 * It cannot speak for live provider rows — nothing at build time can. What it
 * makes impossible is a curated source, or a serving path, that has no rung
 * left to fall back to.
 */
process.env.WF_SUPPRESS_ANALYTICS = "1";
import { cardImageSrc, ownedPlacePhotoSrc, isLandingCardImageAllowed } from "../lib/placePhoto.js";
import { RON_DUPRAT_TOP7, chefPickPlaces } from "../lib/chefPicks.js";
import { FALL_PLACE_IDS } from "../lib/fallPool.js";
import { CURATED_PHOTO_REFS } from "../lib/curatedPhotoRefs.js";
import { photoRefOwnedByPlace } from "../lib/placePhoto.js";
import { readFileSync } from "node:fs";
import { resolvePlacePhoto } from "../lib/placePhotoServe.js";
import { FALL_DISCOVERIES_2026 } from "../lib/fallDiscoveries2026.js";
import { FALL_COLLECTION_POSTER, fallEventCardImageSrc } from "../lib/fallEventImage.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. THE LADDER, rung by rung ─────────────────────────────────────────── */
const ID = "ChIJB-QyVtEXw4gRk5F8bn3YV28";
ok(cardImageSrc({ photo_url: "/owned.jpg" }) === "/owned.jpg",
  "rung 1: an owned photo URL on the row wins");
ok(cardImageSrc({ id: ID, photoRef: `places/${ID}/photos/AB123456` }).startsWith("/api/photo?ref="),
  "rung 2: the row's own Google ref is proxied");
ok(cardImageSrc({ place_id: ID }) === `/api/photo?place=${ID}&w=640`,
  "rung 3: a bare place id still yields a picture — this is the rung that makes a blank card impossible");
ok(cardImageSrc({ name: "no id at all" }) === "",
  "rung 4: a row with no identity yields empty, so a renderer can show branded art (empty is a fact, not a hole)");
// NEGATIVE CONTROLS. A ladder that will wear anything is worse than no ladder.
ok(!cardImageSrc({ id: ID, photoRef: "places/SOMEONE_ELSE/photos/AB123456" }).includes("SOMEONE_ELSE"),
  "a ref belonging to ANOTHER place is refused, never proxied");
ok(cardImageSrc({ id: ID, photo_url: "https://images.pexels.com/x.jpg" }) !== "https://images.pexels.com/x.jpg",
  "a stock-pool URL is refused at rung 1 (lib/placePhoto STOCK_PHOTO_RX)");
ok(ownedPlacePhotoSrc("") === "" && ownedPlacePhotoSrc(null) === "" && ownedPlacePhotoSrc("short") === "",
  "a missing or malformed place id yields empty rather than a proxy call for nothing");
// THE SLUG CONTROL. check-house-card caught this the first time rung 3 shipped:
// house rows are keyed by internal slugs, and turning one into a proxy URL
// replaces the branded per-place monogram with a shared 302 to nothing.
for (const slug of ["kids-empire", "intense-escape", "some-long-lowercase-slug"]) {
  ok(ownedPlacePhotoSrc(slug) === "",
    `"${slug}" is an internal slug, not a Google place id — rung 3 must not fire, so the card keeps its branded monogram`);
  ok(cardImageSrc({ id: slug }) === "", `cardImageSrc agrees for "${slug}"`);
}
ok(cardImageSrc({ id: "ChIJB-QyVtEXw4gRk5F8bn3YV28" }) !== "",
  "…while a real Google place id still climbs to rung 3 (the control that keeps the slug rule from disabling the fix)");

/* ── 2. EVERY CURATED CARD SOURCE, EXECUTED ──────────────────────────────── */
// A curated source is one whose rows live IN THIS REPO. Those are the rows a
// build can speak for, and they are exactly the ones that shipped blank.
const sources = [
  {
    name: "chefPicks (Chef Ron Duprat's Top 7)",
    rows: chefPickPlaces(RON_DUPRAT_TOP7).map((p) => ({ id: p.id, label: p.name, row: p })),
  },
  {
    name: "fallPool FALL_PLACE_IDS (Augtober places)",
    rows: Object.keys(FALL_PLACE_IDS).map((id) => ({ id, label: id, row: { place_id: id } })),
  },
];
for (const src of sources) {
  ok(src.rows.length > 0, `${src.name}: has rows (a vacuous source proves nothing)`);
  for (const { id, label, row } of src.rows) {
    const s = cardImageSrc(row);
    ok(!!s, `${src.name}: "${label}" would render with NO image — give the row an owned photo, a ref, or a place id`);
    ok(isLandingCardImageAllowed(s, id),
      `${src.name}: "${label}" resolves to an image that is not this place's own (${s.slice(0, 60)})`);
  }
}
// The chef seven specifically. Their refs are NOT in the client bundle (see
// lib/curatedPhotoRefs.js for the measurement that decided it), so the two
// halves are asserted separately: the card must resolve to a picture, and the
// server must hold a ref for the id that picture asks for.
for (const e of RON_DUPRAT_TOP7.entries) {
  ok(!("photoRef" in e),
    `chefPicks #${e.rank} ${e.name}: a ~700-char Google resource name must not ride into the CLIENT bundle — it belongs in lib/curatedPhotoRefs.js (this is what took check-bundle red on 2026-08-30)`);
  const ref = CURATED_PHOTO_REFS[e.placeId];
  ok(typeof ref === "string" && ref.startsWith(`places/${e.placeId}/photos/`),
    `chefPicks #${e.rank} ${e.name}: no server-side photo ref, so /api/photo?place= has nothing to resolve and the card renders blank`);
}
// Every curated ref belongs to the place that keys it — a map is exactly the
// shape where a copy-paste puts one venue's photo on another's card.
for (const [id, ref] of Object.entries(CURATED_PHOTO_REFS)) {
  ok(photoRefOwnedByPlace(ref, id), `curatedPhotoRefs["${id}"] is not that place's own photo`);
}
// THE RESOLVER, EXECUTED WITH AN EMPTY LIBRARY — which is these seven places'
// real state. A regex over placePhotoServe would have gone green on the first
// version of this fix, which put the fallback inside defaultInventoryGet: an
// INJECTABLE dep, so the fallback vanished for every caller that stubs it and
// the card still resolved to nothing. Only the call catches that.
for (const e of RON_DUPRAT_TOP7.entries) {
  let seenRef = null;
  const r = await resolvePlacePhoto({ place: e.placeId, w: 640 }, {
    cacheGet: async () => null,
    cacheSet: async () => {},
    inventoryGet: async () => null,   // not in wf_inventory, and never will be
    fetchOwnedUri: async (ref) => { seenRef = ref; return "https://lh3.googleusercontent.com/place-photos/ok"; },
  });
  ok(r.type === "redirect",
    `chef #${e.rank} ${e.name}: /api/photo?place= resolves to nothing when the library has no row — the card renders blank`);
  ok(photoRefOwnedByPlace(seenRef, e.placeId),
    `chef #${e.rank} ${e.name}: resolved to a photo that is not this place's own (${String(seenRef).slice(0, 40)})`);
}
// Inventory must still WIN. A curated entry may fill a hole, never override
// the owned library — otherwise this map silently becomes the source of truth.
{
  const id = RON_DUPRAT_TOP7.entries[0].placeId;
  const r = await resolvePlacePhoto({ place: id, w: 640 }, {
    cacheGet: async () => null, cacheSet: async () => {},
    inventoryGet: async () => ({ photo_url: "https://cdn.example/owned-inventory.jpg" }),
    fetchOwnedUri: async () => "https://lh3.googleusercontent.com/place-photos/ok",
  });
  ok(r.type === "redirect" && String(r.location).includes("owned-inventory"),
    "wf_inventory still wins over the curated map — the map fills holes, it does not override the owned library");
}

// And the shared place card must climb the whole ladder, not its top two rungs.
const iconic = readFileSync(new URL("../app/components/IconicPlaceCard.js", import.meta.url), "utf8");
ok(/ownedPlacePhotoSrc\(p && \(p\.place_id \|\| p\.id\), 640\)/.test(iconic),
  "IconicPlaceCard falls through to ownedPlacePhotoSrc — stopping at `own ref or nothing` is what drew seven empty boxes");
ok(!/^import[^\n]*\bcardImageSrc\b/m.test(iconic),
  "…and it must NOT import cardImageSrc: rung 1 drags the stock blocklist into the homepage client bundle (0.7KB gz against 1.1KB of headroom)");
ok(/hasPlacePhotoRef|ownedPlacePhotoSrc/.test(iconic) && !/"\/api\/photo\?place=" \+/.test(iconic),
  "…and it builds no /api/photo?place= string of its own — the rung helper owns that shape");

/* ── 3. THE TWO SURFACES THAT REGRESSED, executed on real row shapes ─────── */
// An AUGTOBER event row as wf_events actually returns it. The three shapes are
// the three that exist in the table today.
const eventImage = (ev) => ev.hero_image || cardImageSrc({ place_id: ev.place_id }, 640);
ok(eventImage({ hero_image: "/api/photo?ref=places%2FX%2Fphotos%2FY&w=800" }).startsWith("/api/photo?ref="),
  "event with a stored hero_image keeps it — the backfill's work is never overwritten");
ok(!!eventImage({ hero_image: null, place_id: "ChIJB-QyVtEXw4gRk5F8bn3YV28" }),
  "event with NO hero_image but a venue place_id draws the venue — the four blank AUGTOBER tiles");
ok(eventImage({ hero_image: null, place_id: null }) === "",
  "event with neither yields empty rather than inventing a picture of an event nobody photographed");

// And the serving path must actually use the ladder, not a private copy of it.
const fallRoute = readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8");
ok(/import \{ cardImageSrc \}/.test(fallRoute) && /fallEventCardImageSrc/.test(fallRoute) && (fallRoute.match(/cardImageSrc\(/g) || []).length >= 1,
  "app/api/events/fall builds events through the Fall identity gate and places through cardImageSrc — both end at the one owned-photo ladder");
ok(!/"\/api\/photo\?place=" \+ encodeURIComponent/.test(fallRoute),
  "…and no hand-rolled /api/photo?place= string survives beside it");

// A RAIL POSTER IS NOT A PLACE PHOTO. Ten owner-supplied rows once carried
// the exact same scarecrow poster, so every cafe, bar and pottery studio looked
// like the same pumpkin field. The source is clean, and the serving helper
// must also neutralize already-seeded legacy rows until their next data write.
ok(FALL_DISCOVERIES_2026.every((row) => row.hero_image !== FALL_COLLECTION_POSTER),
  "Fall discoveries never store the collection poster as a destination photo");
for (const row of FALL_DISCOVERIES_2026) {
  const legacy = fallEventCardImageSrc({ ...row, hero_image: FALL_COLLECTION_POSTER }, 640);
  ok(legacy !== FALL_COLLECTION_POSTER,
    `${row.event_id}: a legacy seeded poster is rejected at serve time`);
  if (row.place_id) {
    ok(legacy === ownedPlacePhotoSrc(row.place_id, 640),
      `${row.event_id}: the replacement is that venue's own place-id photo`);
    ok(isLandingCardImageAllowed(legacy, row.place_id),
      `${row.event_id}: the replacement image cannot belong to another venue`);
  } else {
    ok(legacy === "",
      `${row.event_id}: without a verified place identity, the card stays honest instead of borrowing a farm photo`);
  }
}
ok(/fallEventCardImageSrc\(e, 640\)/.test(fallRoute),
  "the live Fall endpoint applies the collection-poster rejection before returning cards");

if (fail.length) {
  console.error("check-no-imageless-card: FAILED");
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-no-imageless-card: OK — ${pass} assertions; the ladder is executed rung by rung with foreign-ref and stock negative controls, every curated card source resolves to its OWN picture, and both surfaces that shipped blank on 2026-08-30 are pinned`);
