// scripts/test-events-tours.mjs — locks the Local-tours category view (owner):
// choosing "Local tours" must render the FULL bookable list (paid affiliate
// cards), never just the pinned 3-card rail retitled with zeroed date chips —
// that read as "nothing appears" (reproduced live in Parrish, 12 tours, no list).
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-events-tours: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const src = readFileSync(new URL("../app/components/screens/Events.js", import.meta.url), "utf8");

ok(/tours\.map\(\(t(?:,\s*i)?\)/.test(src), "the tours category renders the FULL list (tours.map), not only the pinned rail");
ok(/Everything bookable near you/.test(src) && /\{tours\.length\}/.test(src), "list header shows the real inventory count");
ok(/!isBusiness && !isTours && !eventsLoading/.test(src), "date chips hidden on the tours view (they zeroed out and read as broken)");
ok(!/<ViatorRail title="Everything bookable near you"/.test(src), "the old retitled-rail-only tours render is GONE");
ok(/ViatorRail title="Bookable experiences near you"/.test(src), "the pinned rail on event categories is untouched");
ok((src.match(/Wayfind may earn a commission at no extra cost to you/g) || []).length === 0, "Events does not repeat ViatorRail's built-in commission disclosure");
ok(/No bookable tours are loading right now/.test(src), "honest empty state kept");
ok(src.includes("ViatorCommerceLink") && /tours\.map\(\(t(?:,\s*i)?\)[\s\S]{0,800}ViatorCommerceLink/.test(src), "every tour card routes through ViatorCommerceLink so the click hits the server redirect layer");

// ── v6.44 + v6.88: full inventory, score-first, honest demand badge ─────────
const route = readFileSync(new URL("../app/api/viator/tours/route.js", import.meta.url), "utf8");
ok(/modePeek === "city" \? 60 : 20/.test(route), "city mode may fetch up to 60; per-place stays capped at 20");
ok(/start: 51, count: 50/.test(route), "second freetext page pulls inventory past Viator's 50-per-page cap");
ok(/r\.flags\.includes\("LIKELY_TO_SELL_OUT"\)/.test(route), "sellingFast passes through Viator's OWN flag verbatim");
ok(!/sellingFast:\s*(true|1|\!)/.test(route), "sellingFast is never hardcoded or inverted");

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(!/\.slice\(0, 12\)/.test(home.slice(home.indexOf("v6.14 — bookable Viator experiences"), home.indexOf("v6.14 — bookable Viator experiences") + 3000)), "the 12-item slice is gone from the Events-tab tours fetch");
ok(home.includes('"/api/viator/tours?q=" + encodeURIComponent(cityQ) + "&count=60"'), "Events tab requests the full city inventory (60)");
ok(/rankExperiences\(d && Array\.isArray\(d\.items\)/.test(home), "Events inventory delegates to the shared highest-Wayfind-Score-first ranker");
ok(!/_bayes/.test(home.slice(home.indexOf("v6.44 (owner): the FULL verified"), home.indexOf("v6.44 (owner): the FULL verified") + 2000)), "Events does not carry a divergent local score formula");
ok(!/rating >= 4\.3/.test(home.slice(home.indexOf("v6.44 (owner): the FULL verified"), home.indexOf("v6.44 (owner): the FULL verified") + 2000)), "no arbitrary rating floor — the owner asked for ALL verified local inventory");

ok(/t\.sellingFast \?/.test(src) && /Selling fast/.test(src), "badge renders only for flagged products");
ok(!/likelyToSellOut|LIKELY_TO_SELL_OUT/.test(src), "the screen never re-derives the flag — it trusts the API passthrough only");
ok(/const tours = rankExperiences\(eventsTours\)/.test(src), "both the pinned rail and full Local tours grid consume a defensively score-ranked list");
ok(/rank=\{i \+ 1\}/.test(src), "commerce analytics receives each card's real ranked position, not rank=1 for every card");
ok(/PlaceScoreChip/.test(src), "the full Local tours grid displays the same Wayfind Score that determines its order");

// ── v6.94: browse first, then book ─────────────────────────────────────────
ok(/for \(let i = 0; i < 8; i\+\+\)/.test(src), "the date chooser stays focused on the immediate eight-day window");
ok(src.indexOf("Choose a day") < src.indexOf('ViatorRail title="Bookable experiences near you"'), "date navigation appears before affiliate inventory");
ok(/const actionLabel = e\.ticketed \? "Get tickets"/.test(src), "ticketed event cards expose a clear Get tickets action");
ok(/Availability from \{e\.source\}/.test(src), "ticket availability keeps its source visible beside the booking action");

console.log(`test-events-tours: OK — ${pass} assertions (full-list view; 60-item city inventory; visible-score order; honest demand badge)`);
