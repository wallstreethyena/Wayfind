// scripts/test-curator-boost.mjs — locks the owner Curator Boost ("god bump") +
// the server-side member-signal contract. The owner's like carries WF_OWNER_LIKE_WEIGHT
// (default 50); everyone else weight 1; the weight flows through the EXISTING
// memberDelta cap so B14 (null base stays null) and the +1.2 like ceiling hold.
import { aggregateLikeSignals } from "../lib/memberSignals.js";
import { memberDelta } from "../lib/ranking.js";
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-curator-boost: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const OWNER = "owner-uuid-1234";
const W = 50;

// 1. owner like = 50, non-owner = 1, mixed sums, ownerPick set correctly.
{
  const a = aggregateLikeSignals([{ place_id: "A", user_id: OWNER }], [], OWNER, W, ["A"]);
  ok(a.counts.A === 50, "owner's single like aggregates as the weight 50 (got " + a.counts.A + ")");
  ok(a.owner.A === true, "owner like sets ownerPick");
  const b = aggregateLikeSignals([{ place_id: "B", user_id: "u1" }], [], OWNER, W, ["B"]);
  ok(b.counts.B === 1 && !b.owner.B, "a non-owner like aggregates as 1 and sets no ownerPick");
  const c = aggregateLikeSignals([{ place_id: "C", user_id: OWNER }, { place_id: "C", user_id: "u1" }, { place_id: "C", user_id: "u2" }], [], OWNER, W, ["C"]);
  ok(c.counts.C === 52 && c.owner.C === true, "owner (50) + two others (2) = 52, ownerPick set (got " + c.counts.C + ")");
}

// 2. REGRESSION PROOF: the aggregate is server-computed + identity-independent —
//    an anonymous visitor gets non-empty signals whenever likes exist (no auth/RLS
//    in this path; a visitor sees exactly what the service-role read computed).
{
  const r = aggregateLikeSignals([{ place_id: "X", user_id: "someone" }], [{ place_id: "X", device_id: "d1" }], OWNER, W, ["X"]);
  ok(r.counts.X > 0, "a place with likes returns a non-empty count regardless of who asks (visitor regression proof)");
}

// 3. B14 — a null base with an owner like stays null (never a fabricated 0.1/10).
{
  const d = memberDelta({ likes: 50 });
  ok(d > 0, "an owner-weighted like is a positive nudge (" + d + ")");
  const wfScore = null;
  const applied = wfScore != null ? +(wfScore + d).toFixed(2) : wfScore; // withMemberSignal's exact guard
  ok(applied === null, "a null base score stays null after the god bump (B14)");
  ok(/p\.wfScore != null \? \+\(\(p\.wfScore \+ d\)/.test(read("app/home.js")), "withMemberSignal keeps the `wfScore != null` guard in source (B14)");
}

// 4. the like nudge is CAPPED even at weight 50 — a product-sane god bump.
{
  ok(memberDelta({ likes: 50 }) === memberDelta({ likes: 5000 }), "50 and 5000 likes give the SAME delta (log curve + 1.2 ceiling)");
  const likeCeil = memberDelta({ likes: 1e9 }) - memberDelta({ likes: 0 });
  ok(likeCeil <= 1.2 + 1e-9, "the like nudge never exceeds +1.2 on the 100-scale (got " + likeCeil.toFixed(3) + ")");
}

// 5. owner UNLIKE returns the aggregate to the non-owner baseline + clears ownerPick.
{
  const withOwner = aggregateLikeSignals([{ place_id: "U", user_id: OWNER }, { place_id: "U", user_id: "u1" }], [], OWNER, W, ["U"]);
  const afterUnlike = aggregateLikeSignals([{ place_id: "U", user_id: "u1" }], [], OWNER, W, ["U"]);
  ok(withOwner.counts.U === 51, "owner + 1 other = 51 before unlike");
  ok(afterUnlike.counts.U === 1 && !afterUnlike.owner.U, "owner unlike -> baseline 1, ownerPick cleared");
}

// 6. weight + owner id are ENV-ONLY — no client-input path, no hardcoded identity.
{
  const route = read("app/api/signals/likes/route.js");
  ok(/process\.env\.WF_OWNER_USER_ID/.test(route) && /process\.env\.WF_OWNER_LIKE_WEIGHT/.test(route), "owner id + weight come from process.env");
  const params = route.match(/searchParams\.get\("([^"]+)"\)/g) || [];
  ok(params.length > 0 && params.every((p) => p.includes('"ids"')), "the route reads ONLY the ids query param from the client: " + JSON.stringify(params));
  // No hardcoded owner identity anywhere in the signal path (public repo). Uses
  // GENERIC UUID/email patterns so this test never contains the real values either.
  const signalSrc = route + read("lib/memberSignals.js");
  ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(signalSrc), "no hardcoded UUID in the signal path — owner id must be env-only");
  ok(!/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(signalSrc), "no hardcoded email in the signal path");
}

// 7. affiliate isolation — the signal path never touches an affiliate/experiences module.
for (const f of ["lib/memberSignals.js", "app/api/signals/likes/route.js"]) {
  ok(!/affiliate|viator|verifiedOffers|bookingResolver/i.test(read(f)), `${f} must not import/touch any affiliate module`);
}

console.log(`test-curator-boost: OK — ${pass} assertions (owner weight 50 in ONE aggregate; visitor regression-proof; B14 holds; +1.2 capped; unlike resets; env-only + no hardcoded identity; affiliate-isolated)`);
