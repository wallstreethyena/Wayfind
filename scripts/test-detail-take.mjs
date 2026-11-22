// scripts/test-detail-take.mjs — locks the Wayfind-take peek-carousel (owner):
// labeled cards in the right order, readable body, nothing hidden.
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
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

const { WayfindTakeRail } = await loadComponent(
  fileURLToPath(new URL("../app/components/sheets/Detail.js", import.meta.url)),
  fileURLToPath(new URL("..", import.meta.url)),
);
const render = (props) => renderToStaticMarkup(createElement(WayfindTakeRail, props));
const editorial = {
  why: "Explore the indoor gardens and the water park in one visit.",
  knownFor: "Three glass atriums represent different parts of Florida.",
  insiderMove: "Ask about a room overlooking the gardens.",
  proof: "Holiday ice sculptures fill the exhibition hall.",
  goodToKnow: "Convention weekends tend to draw larger crowds.",
  funFact: "THREE glass atriums represent different parts of Florida!",
};
const html = render({ editorial, alreadyShown: editorial.why });
for (const body of [editorial.knownFor, editorial.insiderMove, editorial.proof, editorial.goodToKnow]) {
  assert.equal(html.split(body).length - 1, 1, `The real rail renders this tip once: ${body}`);
}
assert.doesNotMatch(html, /Explore the indoor gardens|THREE glass atriums/, "Duplicate text above and inside the rail stays deduplicated");
assert.match(html, /1 \/ 4/, "The counter counts all four distinct cards");
assert.match(html, /aria-label="Show Known for" aria-current="true"/, "The first card is marked current");
assert.match(html, /<button[^>]+aria-label="Show Good to know"/, "The last card has a keyboard-accessible control");
assert.equal(render({ editorial: {} }), "", "Empty editorial has no chrome");
const single = render({ editorial: { insiderMove: editorial.insiderMove } });
assert.match(single, /Ask about a room overlooking the gardens/, "The single-card control still renders");
assert.doesNotMatch(single, /Swipe →/, "A single card does not prompt a swipe");
console.log(`test-detail-take: ${n - failn}/${n} layout assertions; distinct, repeated, and empty editorial render checks passed`);
if (failn) process.exit(1);
