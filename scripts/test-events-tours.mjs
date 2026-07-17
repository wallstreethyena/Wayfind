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

console.log(`test-events-tours: OK — ${pass} assertions (tours filter renders the full paid list; zeroed chips gone; pinned rail intact)`);
