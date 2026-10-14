// scripts/test-area-twins.mjs - locks lib/areaTwins.js (read-only generic-area twin detector).
// Calls the real functions (import + invoke), with a positive control (the real
// 2026-10-14 Winter Haven pair) and negative controls that must NOT be flagged.
import { normalizeAreaName, isAreaName, findAreaTwins } from "../lib/areaTwins.js";

let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("test-area-twins: FAIL - " + m); } };

ok(normalizeAreaName("Downtown, Winter Haven, Fl") === "downtown winter haven", "', Fl' suffix + comma must normalize away");
ok(normalizeAreaName("Downtown Winter Haven") === "downtown winter haven", "plain name normalizes to the same key");
ok(normalizeAreaName("Downtown Winter Haven Historic District") === "downtown winter haven", "'Historic District' suffix is noise");
ok(normalizeAreaName("Downtown Tampa, FL.") === "downtown tampa", "', FL.' with period");
ok(isAreaName("Downtown, Winter Haven, Fl") && isAreaName("Siesta Key Village") && isAreaName("Historic Old Town Kissimmee"), "area names recognised");
ok(!isAreaName("Joe's Pizza") && !isAreaName("Walmart Supercenter"), "business names are not area names");

const row = (id, name, lat, lng, primary_type, reviews, metro = "florida") =>
  ({ place_id: id, name, lat, lng, primary_type, metro, signals: { reviews } });

// Positive control: the real pair, DIFFERENT primary types, 87 m apart.
const A = row("A", "Downtown Winter Haven", 28.0223513, -81.731078, "tourist_attraction", 3);
const B = row("B", "Downtown, Winter Haven, Fl", 28.0221192, -81.7302334, "event_venue", 22);
const hit = findAreaTwins([A, B]);
ok(hit.length === 1, `positive control: expected 1 twin pair, got ${hit.length}`);
if (hit.length === 1) {
  ok(hit[0].meters >= 80 && hit[0].meters <= 95, `distance should be ~87m, got ${hit[0].meters}`);
  ok(hit[0].stronger.place_id === "B" && hit[0].weaker.place_id === "A", "stronger = more reviews (reported only, never auto-chosen)");
  ok(hit[0].sameType === false, "category mismatch must be allowed and reported");
}
// Negative controls.
ok(findAreaTwins([A, row("C", "Downtown Orlando", 28.54, -81.38, "tourist_attraction", 91)]).length === 0, "different cities are not twins");
ok(findAreaTwins([A, row("D", "Downtown Winter Haven", 28.1, -81.6, "tourist_attraction", 5)]).length === 0, "same name 12km apart is not a twin");
ok(findAreaTwins([row("E", "Hyde Park Village", 27.9366, -82.4781, "shopping_mall", 5264), row("F", "Hyde Park Village Fresh Market", 27.9368, -82.4779, "market", 8)]).length === 0, "a business inside a village is not a twin of it");
ok(findAreaTwins([A, { ...A }]).length === 0, "same place_id never pairs with itself");
ok(findAreaTwins([row("G", "Village", 28, -81, "x", 1), row("H", "Village", 28, -81, "x", 1)]).length === 0, "a single generic word is not an identity");

if (bad) { console.error(`test-area-twins: ${bad}/${checks} failed`); process.exit(1); }
console.log(`test-area-twins: OK - ${checks} assertions (positive control = real Winter Haven pair; 5 negative controls)`);
