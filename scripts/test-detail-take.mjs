// scripts/test-detail-take.mjs — locks the Wayfind-take peek-carousel (owner):
// labeled cards in the right order, readable body, nothing hidden.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const s = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
ok(s.includes("function WayfindTakeRail"), "the take rail component exists");
ok(/\["why", "Why go"[\s\S]{0,40}\["knownFor", "Known for"[\s\S]{0,60}\["insiderMove", "Insider move"[\s\S]{0,60}\["proof", "Why it stands out"[\s\S]{0,60}\["goodToKnow", "Good to know"[\s\S]{0,60}\["watchOut", "Heads up"/.test(s), "the owner's card ORDER holds: Why go -> Known for -> Insider move -> Why it stands out -> Good to know -> Heads up");
ok(s.includes('color: "#E6EDF3", lineHeight: 1.55') && s.includes("fontWeight: 400"), "body is near-white and REGULAR weight — the readability fix");
ok(/fontSize: 14, fontWeight: 400, color: "#E6EDF3"/.test(s), "body is 14px, larger and lighter than the label");
ok(s.includes('scrollSnapType: "x mandatory"') && s.includes('flex: multi ? "0 0 86%"'), "the next card PEEKS (86% width) so the rail is obviously swipeable — nothing hidden");
ok(s.includes("Swipe →") && s.includes("{active + 1} / {items.length}"), "a position indicator + swipe hint answers 'how do they know there is more'");
ok(s.includes("onScroll={onScroll}") && s.includes("i === active"), "the progress dots track the swipe");
ok(!/<span style=\{\{ fontSize: 12\.5, fontWeight: 800, color: C\.text \}\}>\{_lb\}: <\/span>/.test(s), "the old gray inline Label: body list is gone");
console.log(`test-detail-take: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
