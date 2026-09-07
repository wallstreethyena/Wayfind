// The detail panel's paid Google request must stay behind the server ledger.
// Failures remain explicit and are never cached as facts about a place.
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
const ok = (condition, message) => condition ? pass++ : failures.push(message);
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const google = read("lib/google.js");
const route = read("app/api/places/details/route.js");
const home = read("app/home.js");
const start = google.indexOf("export async function fetchPlaceDetail(");
const body = google.slice(start);

ok(start >= 0, "fetchPlaceDetail exists");
ok(/fetch\("\/api\/places\/details"/.test(body), "detail fetch uses the same-origin server route");
ok(/kind:\s*"detail"/.test(body), "detail fetch selects the fixed rich-detail tier");
ok(!/importLibrary\(|fetchFields\(|new Place\(/.test(body), "detail fetch cannot fall back to the browser Places SDK");
ok(/detail:\s*"editorialSummary,reviews,regularOpeningHours,nationalPhoneNumber,websiteUri,photos"/.test(route), "server route owns a fixed REST field mask");
ok(/spendAllow\(kind === "area" \? "details_pro" : "details_enterprise"\)/.test(route), "rich detail takes an enterprise ledger grant");
ok(/console\.error\(\s*"\[wf\] fetchPlaceDetail FAILED"/.test(body), "detail failure is logged");
ok(/return \{ ok: true/.test(body) && /ok: false/.test(body), "success and failure have distinct shapes");

const writes = [...home.matchAll(/detailCache\.current\[[^\]]+\]\s*=\s*extra/g)];
ok(writes.length >= 1, "the detail cache write still exists");
for (const match of writes) {
  const before = home.slice(Math.max(0, match.index - 200), match.index);
  ok(/extra\.ok|extra && extra\.ok/.test(before), "only a successful detail response is cached");
}
const persists = [...home.matchAll(/(?<!function )setCachedInsight\(/g)];
ok(persists.length >= 2, "insight persistence call sites are present");
for (const match of persists) {
  const line = home.slice(home.lastIndexOf("\n", match.index), home.indexOf("\n", match.index));
  ok(/detailFailed/.test(line), "failed detail data is never persisted as insight evidence");
}

if (failures.length) {
  for (const message of failures) console.error("check-place-detail-honest: FAIL — " + message);
  process.exit(1);
}
console.log(`check-place-detail-honest: OK — ${pass} assertions (paid detail is server-metered; failures stay visible and uncached)`);
