// /api/known-for — batch lookup of what a place is actually known for.
//
// TWO RESEARCHED SOURCES, SAME PRECEDENCE AS /api/editorial:
//   1. Owner's Atlas card (data/atlas/editorial-cards.json) — hand-curated
//      publish-ready copy, keyed by place_id. WINS where it exists.
//   2. wf_editorial WHERE verified=is.true — the fleet's researched card.
//
// No model is called here and no text is generated: this route either returns
// copy that was written and checked for that specific place, or it returns
// nothing for it. See lib/knownFor.js for why a generic fallback is absent.
//
// The 2026-07-28 failure (clean rows invisible because verified was hardcoded
// false) is not a reason to drop the gate. The flag is now derived at write
// time; this reader still requires it. Atlas cards are already the ingest
// publish-ready set, not a bypass of that bar.
//
// Batched on purpose. The card list needs up to ~20 lines at once, and the
// alternative — one request per card — is what makes a sheet feel slow.
import { knownForMap } from "../../../lib/knownFor";
import { atlasLinesFor } from "../../../lib/atlasCards";
import atlasCards from "../../../data/atlas/editorial-cards.json";

export const runtime = "nodejs";

const MAX_IDS = 40;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body && body.ids)
      ? body.ids.map((x) => String(x || "").trim()).filter(Boolean).slice(0, MAX_IDS)
      : [];
    if (!ids.length) return Response.json({ lines: {} });

    // Atlas is local, publish-ready, and does not need Supabase. Serve it
    // even when the fleet lookup is degraded so a missing env cannot blank
    // a card we already hold research for.
    const atlas = atlasLinesFor(atlasCards, ids);

    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    const need = ids.filter((id) => !atlas[id]);
    if (!need.length) return Response.json({ lines: atlas, found: Object.keys(atlas).length });
    // Missing config is a real failure, not an empty result. Saying so lets the
    // caller keep its existing line instead of silently blanking every card.
    // Atlas lines still return — they did not depend on this lookup.
    if (!url || !anon) return Response.json({ lines: atlas, found: Object.keys(atlas).length, degraded: "no-supabase-config" }, { status: 200 });

    const q = url + "/rest/v1/wf_editorial?select=place_id,hook,why_here,local_tip,issues,verified&verified=is.true&place_id=in.("
      + need.map((i) => '"' + encodeURIComponent(i) + '"').join(",") + ")";
    const r = await fetch(q, {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      // Editorial changes rarely; an hour of edge cache keeps the sheet instant.
      next: { revalidate: 3600 },
    });
    if (!r.ok) return Response.json({ lines: atlas, found: Object.keys(atlas).length, degraded: "upstream-" + r.status }, { status: 200 });
    const rows = await r.json();
    if (!Array.isArray(rows)) return Response.json({ lines: atlas, found: Object.keys(atlas).length, degraded: "bad-shape" }, { status: 200 });

    // Atlas wins on conflict. knownForMap already drops unverified / placeholder rows.
    const researched = { ...knownForMap(rows), ...atlas };

    // ── v8.89 — THE THIRD RUNG: wf_inventory.editorial ──────────────────────
    //
    // Owner, 2026-08-29: "I want to identify why do we have silent cards … and
    // what would be the most effective way to bring those silent cards to the
    // website in a way that will add value."
    //
    // MEASURED, against live data on the day this shipped:
    //
    //   wf_inventory                       12,790 rows
    //   wf_editorial, verified WITH a hook     548   <- all this route could serve
    //   wf_inventory.editorial               2,510
    //   places with an inventory line and NO verified hook   2,253
    //
    // Narrowed to the rows that actually reach a rail (>=100 reviews, >=4.3):
    //
    //   category      qualifying   speaks today   would speak   still silent
    //   food               4,637      304 (6.6%)        +885          3,448
    //   attractions        2,606       21 (0.8%)        +507          2,078
    //   nightlife          1,273       32 (2.5%)        +147          1,094
    //   shopping             435       25               +157            253
    //   hotels               187       35               +111             41
    //   beach                 63       24                +17             22
    //   ─────────────────────────────────────────────────────────────────────
    //   TOTAL              9,201      441 (4.8%)      +1,824    5.1x coverage
    //
    // So the answer to "why are there silent cards" is not "nobody wrote the
    // copy". It is that TWO THIRDS OF THE COPY WE HOLD SITS IN A TABLE THIS
    // ROUTE NEVER ASKED. Attractions is the clearest case: 21 of 2,606 cards
    // could speak, and 507 lines were sitting one query away.
    //
    // WHY IT IS THE LOWEST RUNG AND NOT A REPLACEMENT. These lines are
    // descriptive rather than editorial — "Laid-back spot offering grouper,
    // jumbo shrimp, lobsters & other seafood, plus a salad bar & market". That
    // is a true and useful answer to "what is this place known for", which is
    // exactly the question this route's name asks. It is NOT a Wayfind verdict,
    // so it never outranks one: Atlas wins, then the verified fleet card, and
    // this fills the silence underneath them. `tiers` marks which rung each
    // line came from so a surface can treat them differently — the card gives
    // the descriptive tier a quieter treatment (no accent bar), because the bar
    // is how Wayfind says "this is our read".
    //
    // Fail-soft like every other lookup here: a failure returns what we already
    // resolved rather than blanking a card.
    const stillSilent = need.filter((id) => !researched[id]);
    let inv = {};
    if (stillSilent.length) {
      try {
        const iq = url + "/rest/v1/wf_inventory?select=place_id,editorial&editorial=not.is.null&place_id=in.("
          + stillSilent.map((i) => '"' + encodeURIComponent(i) + '"').join(",") + ")";
        const ir = await fetch(iq, {
          headers: { apikey: anon, Authorization: "Bearer " + anon },
          next: { revalidate: 3600 },
        });
        if (ir.ok) {
          const irows = await ir.json();
          if (Array.isArray(irows)) {
            for (const r of irows) {
              const line = String((r && r.editorial) || "").trim();
              // The same floor the fleet card has to clear: a fragment is not a
              // line, and a card is better silent than half-spoken.
              if (r && r.place_id && line.length >= 24) inv[r.place_id] = line;
            }
          }
        }
      } catch (e) { inv = {}; }
    }

    const tiers = {};
    for (const id of Object.keys(researched)) tiers[id] = "wayfind";
    for (const id of Object.keys(inv)) if (!researched[id]) tiers[id] = "known";

    return Response.json({
      lines: { ...inv, ...researched },
      tiers,
      found: Object.keys(researched).length + Object.keys(inv).length,
      fromInventory: Object.keys(inv).length,
    });
  } catch (e) {
    return Response.json({ lines: {}, degraded: "threw" }, { status: 200 });
  }
}
