// Holiday eligibility and source/identity checks: prevent stale car-show cards,
// closed Thanksgiving museums, selected-night expansion, and guessed map pins.
import assert from "node:assert/strict";
import { THANKSGIVING_EDITORIAL_2026 as rows, THANKSGIVING_EXCLUDED_EVENT_IDS as excluded } from "../lib/thanksgivingEditorial2026.js";
import { HOLIDAYS_2026_GUIDES } from "../lib/guidesHolidays2026.js";
import { GUIDE_QUICK_CHOICES } from "../lib/guideSeo.js";
import { isEligible, isFloridaEvent } from "../lib/curatedEvents.js";
import { occurrenceDatesFor } from "../lib/eventOccurrences.js";

const windowDays = ["2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
const now = new Date("2026-11-23T12:00:00Z");
const byId = new Map(rows.map((row) => [row.event_id, row]));
// Real November23owned-table identities: alternate research IDs caused two
// Parrish cards for Largo/Venice, then the statewide audit found12morealiases.
// Keep source identity separate from presentation title and preserve live slugs.
const LIVE_CANONICAL_IDENTITIES = [
  [
    "winternational-thanksgiving-day-parade-north-miami-2026",
    "winternational-thanksgiving-day-parade-north-miami-2026"
  ],
  [
    "fusionfest-2026",
    "fusionfest-2026"
  ],
  [
    "air-and-ice-circus-arts-conservatory-sarasota-2026",
    "air-and-ice-circus-arts-conservatory-sarasota-2026"
  ],
  [
    "sarasota-medieval-fair-2026",
    "sarasota-medieval-fair-2026"
  ],
  [
    "tampa-ymca-turkey-gobble-2026",
    "tampa-ymca-turkey-gobble-2026"
  ],
  [
    "jacksonville-light-boat-parade-2026",
    "jacksonville-light-boat-parade-2026"
  ],
  [
    "pensacola-winterfest-elf-parade-and-trolley-tours-2026",
    "pensacola-winterfest-elf-parade-and-trolley-tours-2026"
  ],
  [
    "zoo-lights-miami-2026",
    "zoo-lights-miami-2026"
  ],
  [
    "nights-of-lights-2026",
    "st-augustine-nights-of-lights-2026"
  ],
  [
    "holiday-lights-in-largo-central-park-2026",
    "holiday-lights-in-largo-central-park-2026"
  ],
  [
    "holiday-light-display-dorothy-b-oven-park-2026",
    "holiday-light-display-dorothy-b-oven-park-2026"
  ],
  [
    "allison-christmas-spectacular-2026",
    "allison-christmas-spectacular-2026"
  ],
  [
    "deck-the-chairs-2026",
    "deck-the-chairs-jacksonville-beach-2026"
  ],
  [
    "fishermens-village-holiday-festival-of-lights-2026",
    "fishermens-village-holiday-festival-of-lights-2026"
  ],
  [
    "the-mayors-hometown-christmas-venice-2026",
    "the-mayors-hometown-christmas-venice-2026"
  ],
  [
    "now-snowing-celebration-2026",
    "now-snowing-celebration-2026"
  ],
  [
    "edison-and-ford-holiday-nights-2026",
    "edison-and-ford-holiday-nights-2026"
  ],
  [
    "naples-night-lights-2026",
    "naples-botanical-garden-night-lights-2026"
  ]
];
for (const [id, slug] of LIVE_CANONICAL_IDENTITIES) {
  assert.equal(byId.get(id)?.slug, slug, `${id}: merge the real DB outing rather than append a duplicate research alias`);
  assert.ok(!excluded.includes(id), `${id}: canonical live identity cannot be excluded`);
}

const sourcedPoints = new Map([
  ["fusionfest-2026", [28.5719532, -81.3662078]],
  ["tampa-ymca-turkey-gobble-2026", [27.943588760286, -82.452420401917]],
]);

function validateEditorial(candidates) {
  assert.equal(new Set(candidates.map((row) => row.event_id)).size, candidates.length, "each outing has one canonical identity");
  for (const row of candidates) {
    assert.ok(!excluded.includes(row.event_id), `${row.event_id}: canceled/duplicate identity cannot serve`);
    assert.ok(isEligible(row, { now }) && isFloridaEvent(row), `${row.event_id}: displayable Florida source`);
    assert.ok(typeof row.slug === "string" && /^[a-z0-9-]+$/.test(row.slug), "preserve existing canonical event-page slug");
    assert.ok(row.source_url.startsWith("https://"));
    assert.equal(row.official_event_url, row.source_url);
    assert.equal(row.last_verified_at.slice(0, 10), "2026-11-23");
    assert.equal(row.select_nights, true, "holiday overlay uses explicit occurrences");
    assert.deepEqual(occurrenceDatesFor(row), row.eligible_dates);
    assert.ok(row.eligible_dates.length > 0 && row.eligible_dates.every((day) => windowDays.includes(day)), `${row.event_id}: no inferred off-weekend date`);
    assert.equal(row.start_date, row.eligible_dates[0]);
    assert.equal(row.end_date, row.eligible_dates.at(-1));
    assert.ok(row.place_id === null || /^ChIJ[\w-]+$/.test(row.place_id), `${row.event_id}: no synthetic place ID`);
    assert.equal(row.venuePlaceId, row.place_id);
    const sourcePoint = sourcedPoints.get(row.event_id);
    if (sourcePoint) {
      assert.deepEqual([row.lat, row.lng], sourcePoint);
      assert.ok(row.coordinate_evidence.url.startsWith("https://"));
    } else {
      assert.equal(row.lat, null, `${row.event_id}: canonical inventory must supply map coordinates`);
      assert.equal(row.lng, null);
    }
    assert.ok([true, false, null].includes(row.is_free));
    assert.equal(row.from_price, undefined, "no unverified price is created");
  }
}
validateEditorial(rows);
assert.equal(rows.length, 22, "all researched programs are represented");
assert.equal(new Set(rows.map((row) => row.region)).size, 8, "research spans eight Florida regions");
assert.ok(excluded.includes("daytona-turkey-run-2026"), "fresh cancellation vetoes stale DB/guide copy");
assert.deepEqual(byId.get("morse-museum-thanksgiving-weekend-2026").eligible_dates, windowDays.slice(1), "Morse closed Thanksgiving Day");
assert.deepEqual(byId.get("zoo-lights-miami-2026").eligible_dates, ["2026-11-27", "2026-11-28"], "Zoo Lights is not Sunday or daytime admission");
assert.deepEqual(byId.get("air-and-ice-circus-arts-conservatory-sarasota-2026").eligible_dates, ["2026-11-27", "2026-11-28"], "precise show sessions override tourism range");
assert.match(byId.get("edison-and-ford-holiday-nights-2026").planning_notes, /NOTofferedNov27/, "opening night must not claim guided tours");
assert.equal(byId.get("fusionfest-2026").place_id, "ChIJz1lxRZd654gRnkU30_ihWc8", "2026 FusionFest uses Loch Haven Park");
assert.equal(byId.get("north-miami-turkey-trot-2026").place_id, "ChIJh-FG6QOy2YgR7rTiNiAFokg", "5K start uses verified MOCA identity");
assert.equal(byId.get("winternational-thanksgiving-day-parade-north-miami-2026").place_id, null, "parade route cannot borrow nearby MOCA point");
assert.equal(byId.get("pensacola-elf-parade-2026").lat, null, "known wrong legacy parade point stays absent");
assert.equal(byId.get("pensacola-winterfest-elf-parade-and-trolley-tours-2026").timezone, "America/Chicago");
assert.equal(byId.get("pensacola-elf-parade-2026").timezone, "America/Chicago");
assert.equal(byId.get("winternational-thanksgiving-day-parade-north-miami-2026").is_free, null, "unknown admission is not invented as free");
assert.equal(byId.get("sarasota-medieval-fair-2026").start_time, null, "unknown fair hours stay unknown");
assert.equal(byId.get("naples-night-lights-2026").start_time, null, "different nightly schedules are not collapsed into one generic time");

const guide = HOLIDAYS_2026_GUIDES["florida-thanksgiving-weekend-2026"];
assert.equal(guide.picks.length, 14, "replacement preserves guide count and pick anchors");
assert.ok(!guide.picks.some((pick) => /Daytona Turkey Run/i.test(pick.name)), "canceled car show is not a recommendation");
assert.equal(guide.picks[6].name, "FusionFest");
assert.match(guide.intro, /Daytona Turkey Run was canceled/);
assert.match(guide.faq.find((item) => /Daytona Turkey Run/.test(item.q)).a, /^No\./);
for (const choice of GUIDE_QUICK_CHOICES["florida-thanksgiving-weekend-2026"]) {
  const pick = guide.picks.find((item) => item.name === choice.pickName);
  assert.ok(pick, `SEO choice ${choice.label} must refer to a live pick`);
  assert.ok(pick.blurb.includes(choice.evidence), `SEO choice ${choice.label} needs its pick's actual evidence`);
  assert.equal(guide.picks[Number(choice.href.replace("#pick-", "")) - 1], pick, "quick choice anchor matches selected pick");
}

// Negative controls exercise the actual validation against the failures above.
assert.throws(() => validateEditorial([{ ...rows[0], event_id: "daytona-turkey-run-2026" }]), /canceled/);
assert.throws(() => validateEditorial([{ ...rows[0], occurrence_dates: ["2026-11-25"] }]), /deep-equal|strictly deep-equal/i);
assert.throws(() => validateEditorial([{ ...rows[0], place_id: "venue-moca" }]), /synthetic/);
assert.throws(() => validateEditorial([{ ...rows[0], lat: 25.9, lng: -80.1 }]), /canonical inventory/);
console.log("Thanksgiving editorial: 22 source-backed programs, holiday closures, exact nights, venue identity, cancellation and SEO controls passed.");
