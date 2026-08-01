// The map is an exploration surface, not a six-query loading screen. It opens
// on Food, draws local 1/2/3-mile context immediately, and keeps category
// changes inside the same map instead of falling back to the old mixed pool.
import { readFileSync } from "node:fs";
import { MAP_DEFAULT_CATEGORY, MAP_RING_MILES, distanceRingData } from "../lib/mapExplorer.js";

let pass = 0;
const fail = (message) => { console.error("test-map-explorer: FAIL — " + message); process.exit(1); };
const ok = (condition, message) => { if (!condition) fail(message); pass += 1; };

ok(MAP_DEFAULT_CATEGORY === "food", "Food is the explicit map default");
ok(JSON.stringify(MAP_RING_MILES) === JSON.stringify([1, 2, 3]), "local rings are exactly 1, 2, and 3 miles");

const data = distanceRingData({ lat: 28.5383, lng: -81.3792 });
ok(data.features.filter((f) => f.properties.kind === "ring").length === 3, "three ring lines are generated");
ok(data.features.filter((f) => f.properties.kind === "label").map((f) => f.properties.label).join("|") === "1 mi|2 mi|3 mi", "each ring has a readable distance label");
ok(data.features.every((f) => f.geometry && Array.isArray(f.geometry.coordinates)), "ring geometry is valid GeoJSON");

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/const \[cat, setCat\] = useState\(MAP_DEFAULT_CATEGORY\)/.test(home), "Food is the actual selected category on first render");
ok(/useState\(true\);\s*\/\/ Map opens on Food/.test(home), "map category browsing is active on first render");
ok(!/Promise\.all\(CATEGORIES\.map\(\(c\) => searchPlaces/.test(home), "opening the map no longer launches every category search");
ok(/Setting the map around you/.test(home), "the first paint shows an intentional local-ring preview instead of an empty map");

const screen = readFileSync(new URL("../app/components/screens/Map.js", import.meta.url), "utf8");
ok(/showSubs=\{false\}/.test(screen) && /activeCat=\{cat\}/.test(screen), "compact map category bar highlights the active category without covering the map with subfilters");
ok(!/Numbered by rank/.test(screen), "the bulky map legend is gone; numbered pins and the result drawer carry that meaning");
ok(/bottom: 76/.test(screen) && /Browse list/.test(screen), "the result drawer floats above bottom navigation and remains discoverable");

const view = readFileSync(new URL("../app/components/MapView.js", import.meta.url), "utf8");
ok(/distanceRingData\(origin\)/.test(view), "MapView renders the shared immediate ring geometry");
ok(/zoom: rings \? 11\.55 : 11/.test(view), "ring mode opens wide enough to show all three neighborhood rings");
ok(/cluster:\s*true/.test(view) && /wf-place-cluster-count/.test(view), "dense results collapse into readable count bubbles instead of overlapping pins");

console.log(`test-map-explorer: OK — ${pass} assertions (Food-first category map; immediate labeled 1/2/3-mile rings)`);
