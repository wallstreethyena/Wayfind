// scripts/test-closed-place-pages.mjs — a place Wayfind's own inventory
// records as closed must never render as an open, bookable attraction.
// Executes mergePlacePage (not a source-only grep).
//
// Locked (2026-11-19 audit: 10 of 12 CLOSED_PERMANENTLY rows rendered as
// normal open places because cached Google details said OPERATIONAL):
//   1. skel.status CLOSED_PERMANENTLY beats details.businessStatus OPERATIONAL.
//   2. skel.status CLOSED_TEMPORARILY beats details.businessStatus OPERATIONAL.
//   3. With no inventory status, the Google details status still flows through.
//   4. With inventory OPERATIONAL, a closed Google status still flows through
//      (either source reporting closure wins over an "open" claim).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergePlacePage } from "../lib/atlasPlaceAllowlist.js";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };

const base = (skelStatus, detailsStatus) => mergePlacePage("ChIJclosedAuditProbe", {
  skel: { place_id: "ChIJclosedAuditProbe", name: "Audit Probe", lat: 27.9, lng: -82.6, category: "food", status: skelStatus, signals: {} },
  details: { name: "Audit Probe", businessStatus: detailsStatus },
  atlas: null, guide: null, editorial: null,
});

ok(base("CLOSED_PERMANENTLY", "OPERATIONAL")?.businessStatus === "CLOSED_PERMANENTLY", "inventory CLOSED_PERMANENTLY beats cached OPERATIONAL");
ok(base("CLOSED_TEMPORARILY", "OPERATIONAL")?.businessStatus === "CLOSED_TEMPORARILY", "inventory CLOSED_TEMPORARILY beats cached OPERATIONAL");
ok(base(null, "CLOSED_TEMPORARILY")?.businessStatus === "CLOSED_TEMPORARILY", "details status flows when inventory has none");
ok(base("OPERATIONAL", "CLOSED_PERMANENTLY")?.businessStatus === "CLOSED_PERMANENTLY", "details CLOSED_PERMANENTLY flows when inventory OPERATIONAL");
ok(base("OPERATIONAL", "OPERATIONAL")?.businessStatus === "OPERATIONAL", "both OPERATIONAL stays OPERATIONAL");
ok(base(null, null)?.businessStatus === null, "no status anywhere stays null");

// The durable page must consult wf_inventory status even when the
// wf_place_ids skeleton (which carries no status) opened the page.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const placeDataSrc = readFileSync(join(root, "lib/placeData.js"), "utf8");
ok(placeDataSrc.includes('if (row && (row.status === "CLOSED_PERMANENTLY" || row.status === "CLOSED_TEMPORARILY")) page.businessStatus = row.status;'), "loadPlace applies wf_inventory closure over the merged page");

// 2026-11-25: wf_inventory.status also carries curation marks. EXCLUDED is
// not a business status; it rendered a duplicate, bookable Robinson Preserve
// page as "Permanently closed". Only a real closure may reach the label.
ok(base("EXCLUDED", "OPERATIONAL")?.businessStatus === "OPERATIONAL", "inventory EXCLUDED never overrides an open status");
ok(base("EXCLUDED", null)?.businessStatus === null, "inventory EXCLUDED alone is no business status");
ok(base("FUTURE_OPENING", null)?.businessStatus === "FUTURE_OPENING", "FUTURE_OPENING still flows as data");
const placePageSrc = readFileSync(join(root, "lib/placePage.js"), "utf8");
ok(placePageSrc.includes('const closedLabel = p.businessStatus === "CLOSED_TEMPORARILY" ? "Temporarily closed" : null;'), "the open-page closed label speaks only for a temporary closure");
ok(/"Permanently closed"/.test(placePageSrc), "positive control: the permanently closed page still exists");
ok(!/: "Permanently closed"\}/.test(placePageSrc), "no fall-through maps an unknown status to Permanently closed");

console.log(`test-closed-place-pages: ${bad ? "FAIL" : "OK"} — ${n} assertions`);
if (bad) process.exit(1);
