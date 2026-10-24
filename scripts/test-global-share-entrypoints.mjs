import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupPlanHref, concreteSharePlaceId } from "../lib/shareContext.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
let n = 0;
const check = (fn) => { fn(); n++; };

// Previously missing or dead sharing entry points must stay wired to the one
// shared flow. A handler that only records analytics leaves a live-looking
// Share button over a no-op (the v8.30.1 failure class).
const map = read("app/components/screens/Map.js");
check(() => assert.match(map, /from "\.\.\/\.\.\/\.\.\/lib\/cardActions"/, "map place share uses the shared card floor"));
check(() => assert.match(map, /shareCard\(target, \{ surface: "map_preview" \}\)/, "map place preview opens the shared share flow"));
check(() => assert.doesNotMatch(map, /onShare=\{\(\) => \{ try \{ addShared\(actionPlace\(mp\)\); \} catch/, "map place preview must not be analytics-only"));
check(() => assert.match(map, /Share this event/, "map event preview offers Share"));
check(() => assert.match(map, /openShareFlow\(\{ title: ev\.name/, "map event share opens the shared flow"));

const best = read("app/components/BestNearby.js");
check(() => assert.match(best, /fallbackShareCard\(\{ id: p\.place_id, name: p\.name \}/, "top-40 card falls back to the shared share flow"));
check(() => assert.doesNotMatch(best, /onShare=\{\(\) => \{ try \{ onLog && onLog\("share", null, \{ id: p\.place_id, kind: "top40_card" \}\); \} catch \(e\) \{\} \}\}/, "top-40 share must not be analytics-only"));

const itin = read("app/components/screens/Itinerary.js");
check(() => assert.match(itin, /shareList\(items\.map\(\(it\) => it\.place\)/, "itinerary trip shares through the existing list flow"));
check(() => assert.match(itin, /Share ↗/, "itinerary trip shows a Share action"));

// Executed behavior: the shared gate itself, not just its source text.
check(() => assert.equal(groupPlanHref("ChIJfixture", "Ulele", false), null));
check(() => assert.equal(groupPlanHref("", "Ulele", true), "/group-plans/new?pick=1"));
check(() => assert.match(groupPlanHref("ChIJfixture", "Ulele", true), /^\/group-plans\/new\?place=ChIJfixture/));
check(() => assert.equal(concreteSharePlaceId("a/b"), ""));
check(() => assert.equal(concreteSharePlaceId(" ChIJfixture "), "ChIJfixture"));

// Group Vote stays fail-closed behind both rollout flags. This PR prepares
// entry points; activation remains the owner's migration/verification step.
const ctx = read("lib/shareContext.js");
check(() => assert.match(ctx, /NEXT_PUBLIC_GROUP_PLANS_ENABLED === "1"/, "group action still requires the public rollout flag"));
for (const page of ["app/group-plans/page.js", "app/group-plans/new/page.js", "app/group-plans/[id]/page.js"]) {
  check(() => assert.match(read(page), /WF_GROUP_PLANS_ENABLED/, page + " still requires the server rollout flag"));
}

// Both share sheets center on wide screens instead of hugging the bottom edge.
check(() => assert.match(read("app/components/shareIntentSheet.js"), /min-width:720px/, "intent sheet centers on desktop"));
check(() => assert.match(read("lib/shareChooser.js"), /min-width:720px/, "share chooser centers on desktop"));

console.log(`global-share-entrypoints PASS: ${n} assertions`);
