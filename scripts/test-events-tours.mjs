// scripts/test-events-tours.mjs — locks the Local-tours category view (owner):
// choosing "Local tours" must render the FULL bookable list (paid affiliate
// cards), never just the pinned 3-card rail retitled with zeroed date chips —
// that read as "nothing appears" (reproduced live in Parrish, 12 tours, no list).
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-events-tours: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const src = readFileSync(new URL("../app/components/screens/Events.js", import.meta.url), "utf8");

ok(/tours\.map\(\(t\)/.test(src), "the tours category renders the FULL list (tours.map), not only the pinned rail");
ok(/Everything bookable near you/.test(src) && /\{tours\.length\}/.test(src), "list header shows the real inventory count");
ok(/!isBusiness && !isTours && !eventsLoading/.test(src), "date chips hidden on the tours view (they zeroed out and read as broken)");
ok(!/<ViatorRail title="Everything bookable near you"/.test(src), "the old retitled-rail-only tours render is GONE");
ok(/ViatorRail title="Bookable experiences near you"/.test(src), "the pinned rail on event categories is untouched");
ok(/No bookable tours are loading right now/.test(src), "honest empty state kept");
ok(/href=\{t\.url\}/.test(src), "every tour card links out on the tour's own (affiliate) url");

// ── v6.44 (owner): full inventory, sell-out-flag-first, honest badge ────────
const route = readFileSync(new URL("../app/api/viator/tours/route.js", import.meta.url), "utf8");
ok(/modePeek === "city" \? 60 : 20/.test(route), "city mode may fetch up to 60; per-place stays capped at 20");
ok(/start: 51, count: 50/.test(route), "second freetext page pulls inventory past Viator's 50-per-page cap");
ok(/r\.flags\.includes\("LIKELY_TO_SELL_OUT"\)/.test(route), "sellingFast passes through Viator's OWN flag verbatim");
ok(!/sellingFast:\s*(true|1|\!)/.test(route), "sellingFast is never hardcoded or inverted");

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(!/\.slice\(0, 12\)/.test(home.slice(home.indexOf("v6.14 — bookable Viator experiences"), home.indexOf("v6.14 — bookable Viator experiences") + 3000)), "the 12-item slice is gone from the Events-tab tours fetch");
ok(home.includes('"/api/viator/tours?q=" + encodeURIComponent(cityQ) + "&count=60"'), "Events tab requests the full city inventory (60)");
ok(/b\.sellingFast \? 1 : 0/.test(home), "sort leads with Viator's sell-out flag");
ok(/_bayes/.test(home) && home.includes("(v / (v + m)) * t.rating"), "then best-to-worst by review-weighted confidence, not raw stars");
ok(!/rating >= 4\.3/.test(home.slice(home.indexOf("v6.44 (owner): the FULL verified"), home.indexOf("v6.44 (owner): the FULL verified") + 2000)), "no arbitrary rating floor — the owner asked for ALL verified local inventory");

ok(/t\.sellingFast \?/.test(src) && /Selling fast/.test(src), "badge renders only for flagged products");
ok(!/likelyToSellOut|LIKELY_TO_SELL_OUT/.test(src), "the screen never re-derives the flag — it trusts the API passthrough only");

console.log(`test-events-tours: OK — ${pass} assertions (full-list view; 60-item city inventory; sell-out flag passthrough + honest badge; bayes order)`);
