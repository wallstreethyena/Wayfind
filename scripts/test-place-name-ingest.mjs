// scripts/test-place-name-ingest.mjs — the owner's name-based place intake
// (lib/placeNameIngest.js + app/api/cron/place-name-ingest) may only make a
// card for the ONE Google listing a request names, at Wayfind Score 9.0+ with
// a Google photo, on free ledger grants. Asserted by CALL on the pure rules and
// by source on the route's wiring.
import { readFileSync } from "node:fs";
import {
  pickCandidate, mismatchReason, requiredWords, cardDecision, toPlacesObject,
  INGEST_MIN_SCORE, TERMINAL, RETRYABLE,
} from "../lib/placeNameIngest.js";
import { wayfindScore } from "../lib/wayfindScore.js";
import { buildInventoryRow } from "../lib/seedPlaces.js";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("FAIL: " + m); } };

const req = { name: "Thai Thani", area: "Celebration", near_lat: 28.32, near_lng: -81.54 };
const res = (id, name, addr) => ({ id, displayName: { text: name }, formattedAddress: addr });

// Words
ok(JSON.stringify(requiredWords({ name: "The Great Escape Room & Co" })) === JSON.stringify(["great", "escape", "room", "co"]), "filler words are dropped from required words");
ok(JSON.stringify(requiredWords({ name: "x", match_words: ["Level99"] })) === JSON.stringify(["level99"]), "explicit match words win");

// Matching
const good = res("ChIJgood", "Thai Thani Restaurant & Bar", "701 Front St, Celebration, FL 34747, USA");
ok(mismatchReason(good, req) === null, "a listing with the name and the town fits");
ok(/name lacks/.test(mismatchReason(res("a", "Thai Palace", "1 Main St, Celebration, FL 34747, USA"), req)), "a different name is refused");
ok(/address lacks/.test(mismatchReason(res("b", "Thai Thani", "11025 International Dr, Orlando, FL 32821, USA"), req)), "the same chain in another town is refused");
ok(/Florida/.test(mismatchReason(res("c", "Thai Thani", "1 Celebration Way, Celebration, TX 75000, USA"), req)), "an out-of-state address is refused");
ok(/name lacks/.test(mismatchReason(res("d", "Thaithani", "701 Front St, Celebration, FL 34747, USA"), req)), "words match on whole words only");

ok(pickCandidate([res("x", "Thai Palace", "1 A St, Celebration, FL 34747, USA"), good], req).place.id === "ChIJgood", "the one fitting listing is picked even when it is not first");
ok(pickCandidate([good, { ...good }], req).place.id === "ChIJgood", "the same listing twice is still one pick");
const two = pickCandidate([good, res("ChIJother", "Thai Thani Express", "2 Market St, Celebration, FL 34747, USA")], req);
ok(two.status === "ambiguous" && !two.place, "two different fitting listings are ambiguous, never a guess");
ok(pickCandidate([], req).status === "no_match", "no listing is no_match");
ok(pickCandidate([res("y", "Thai Palace", "1 A St, Celebration, FL 34747, USA")], req).status === "no_match", "no fitting listing is no_match");

// The card decision, at the real score formula
const s96 = wayfindScore(4.9, 1200);
const s89 = wayfindScore(4.3, 3000);
ok(s96 >= INGEST_MIN_SCORE && s89 < INGEST_MIN_SCORE, `fixtures straddle the 9.0 bar (${s96}, ${s89})`);
ok(cardDecision({ score: s96, businessStatus: "OPERATIONAL", photoRef: "places/x/photos/wfplacediscovery" }).publish === true, "9.0+ with a photo publishes");
ok(cardDecision({ score: INGEST_MIN_SCORE, businessStatus: "OPERATIONAL", photoRef: "p" }).publish === true, "exactly 9.0 publishes");
ok(cardDecision({ score: INGEST_MIN_SCORE - 1, businessStatus: "OPERATIONAL", photoRef: "p" }).status === "below_9", "8.9 does not");
ok(cardDecision({ score: s89, photoRef: "p" }).status === "below_9", "a real sub-9 place is below_9");
ok(cardDecision({ score: s96, businessStatus: "OPERATIONAL", photoRef: null }).status === "no_photo", "no Google photo means no card");
ok(cardDecision({ score: null, photoRef: "p" }).status === "no_rating", "no rating means no card, never an invented score");
ok(cardDecision({ score: s96, businessStatus: "CLOSED_PERMANENTLY", photoRef: "p" }).status === "closed", "a closed listing never becomes a card");
for (const st of ["below_9", "no_photo", "no_rating", "closed", "published", "ambiguous", "no_match"]) ok(TERMINAL.includes(st), `${st} is terminal`);
ok(RETRYABLE.includes("waiting_rating") && !TERMINAL.includes("waiting_rating"), "a refused rating grant is retryable, not terminal");

// The row the shared builder makes from the route's object
const details = { name: "Thai Thani Restaurant & Bar", lat: 28.318, lng: -81.545, types: ["thai_restaurant", "restaurant", "food"], businessStatus: "OPERATIONAL", rating: 4.7, reviews: 2400, photoRef: "places/ChIJgood/photos/wfplacediscovery" };
const built = buildInventoryRow(toPlacesObject({ place_id: "ChIJgood", primary_type: "thai_restaurant" }, details), "orlando", { nowIso: "2026-11-28T00:00:00Z" });
ok(built.row && built.row.category === "food", "the shared builder classifies the place from Google's own types");
ok(built.row && built.row.signals.rating === 4.7 && built.row.signals.reviews === 2400, "the card carries Google's rating and count, nothing invented");
ok(built.row && /wfplacediscovery$/.test(built.row.photo_ref || ""), "the card carries the place-only photo ref");

// Route wiring (source)
const route = readFileSync(new URL("../app/api/cron/place-name-ingest/route.js", import.meta.url), "utf8");
const code = route.replace(/^\s*\/\/.*$/gm, "");
ok(/req\.headers\.get\("authorization"\) !== "Bearer " \+ secret/.test(code), "only the cron secret opens the route");
ok(code.indexOf('spendAllow("text_pro")') > 0 && code.indexOf('spendAllow("text_pro")') < code.indexOf("await textSearch(gkey, r)"), "the lookup asks the text_pro ledger before calling Google");
ok(!/rating|userRatingCount|businessStatus/.test((code.match(/const TEXT_PRO_MASK = \[([^\]]*)\]/) || [])[1] || "x"), "the lookup mask has no Enterprise field");
ok(/getPlaceDetailsDated\(r\.place_id\)/.test(code), "the rating comes from the shared, ledger-gated Place Details read");
ok(/validateInventoryRow\(w, \{ metroKey: metro, metros \}\)/.test(code) && /partitionSplitVenues\(/.test(code), "cards pass the same validator and twin check as promote-index");
ok(code.indexOf("cardDecision(") < code.indexOf("rest/v1/wf_inventory`"), "the 9.0 decision runs before any card write");
const mig = readFileSync(new URL("../supabase/migrations/20261128190000_wf_place_name_requests.sql", import.meta.url), "utf8");
ok(/enable row level security/.test(mig) && !/create policy/i.test(mig), "the request table is service-role only");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
ok((vercel.crons || []).some((c) => /^\/api\/cron\/place-name-ingest$/.test(c.path)), "the job is scheduled");

console.log(bad ? `FAIL ${bad}/${n}` : `OK test-place-name-ingest: ${n} assertions`);
process.exit(bad ? 1 : 0);
