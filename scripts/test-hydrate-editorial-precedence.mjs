#!/usr/bin/env node
// scripts/test-hydrate-editorial-precedence.mjs — hydrateEditorialFor must
// serve the VERIFIED wf_editorial line over the inventory text.
//
// THE BUG THIS LOCKS (2026-11-03): rail payloads (lib/railsData.js) and
// served inventory cards hydrated `editorial` from wf_inventory.editorial
// alone. That field is the LOWEST rung of the site's editorial precedence —
// /api/known-for serves Atlas > verified wf_editorial > editorial_card >
// inventory — so every place whose real line was researched into
// wf_editorial (281 creator-registry places by 2026-10-31) showed either a
// descriptive inventory sentence or nothing on rail cards, while the same
// place spoke with its verified line in the sheet. EXECUTES the real
// hydrateEditorialFor against a mocked fetch.
process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";

const { hydrateEditorialFor } = await import("../lib/inventoryServe.js");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const INV = {
  A: "A descriptive inventory sentence about A.",
  B: "A descriptive inventory sentence about B.",
  C: null,
  D: "A descriptive inventory sentence about D.",
};
const ED = {
  A: { place_id: "A", hook: "A is known for its grouper sandwich.", why_here: null, local_tip: "Order it blackened.", verified: true, issues: null },
  B: { place_id: "B", hook: "Independent verification of this listing's specifics was not completed in this research pass.", why_here: null, local_tip: null, verified: false, issues: ["FAILED VERIFICATION"] },
  C: { place_id: "C", hook: "C is known for sunrise paddles on the bay.", why_here: null, local_tip: null, verified: true, issues: null },
};

const realFetch = global.fetch;
global.fetch = async (url) => {
  const u = String(url);
  const ids = decodeURIComponent(u.split("place_id=in.(")[1].split(")")[0]).split(",");
  const json = (rows) => ({ ok: true, json: async () => rows });
  if (u.includes("/rest/v1/wf_editorial_servable")) return json(ids.filter((id) => ED[id]).map((id) => ED[id]));
  if (u.includes("/rest/v1/wf_inventory")) return json(ids.filter((id) => id in INV).map((id) => ({ place_id: id, editorial: INV[id] })));
  return { ok: false, json: async () => [] };
};
try {
  const out = await hydrateEditorialFor(["A", "B", "C", "D"]);
  ok(out.get("A") === "A is known for its grouper sandwich. Order it blackened.",
    "verified wf_editorial line (hook + tip) must outrank the inventory sentence");
  ok(out.get("B") === INV.B,
    "a FAILED VERIFICATION row must not overlay; the inventory sentence stands");
  ok(out.get("C") === "C is known for sunrise paddles on the bay.",
    "a verified line must appear even when inventory editorial is null");
  ok(out.get("D") === INV.D, "a place with no verified row keeps its inventory sentence");

  // Degradation: the verified read failing must not blank the inventory read.
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/rest/v1/wf_editorial_servable")) return { ok: false, json: async () => [] };
    const ids = decodeURIComponent(u.split("place_id=in.(")[1].split(")")[0]).split(",");
    return { ok: true, json: async () => ids.filter((id) => id in INV).map((id) => ({ place_id: id, editorial: INV[id] })) };
  };
  const out2 = await hydrateEditorialFor(["A"]);
  ok(out2.get("A") === INV.A, "a failed verified read degrades to the inventory sentence, not silence");
} finally {
  global.fetch = realFetch;
}

if (fail.length) { console.error(`test-hydrate-editorial-precedence: FAIL — ${fail.length} problem(s)`); for (const f of fail) console.error("  " + f); process.exit(1); }
console.log(`test-hydrate-editorial-precedence: OK — ${pass} assertions (verified wf_editorial line wins over inventory text; failed-verification rows never overlay; degradation keeps the inventory sentence)`);
