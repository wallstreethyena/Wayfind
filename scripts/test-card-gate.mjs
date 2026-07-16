// scripts/test-card-gate.mjs — v6.39 GLOBAL card-completeness guardrail.
// Locks two halves: (1) the pure gate behaves (nameless/ghost cards refused,
// real places pass), (2) PlaceCard actually CALLS it before rendering.
import { readFileSync } from "fs";
import { cardComplete } from "../lib/score.js";

let pass = 0;
const fail = (m) => { console.error("test-card-gate: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── the gate itself ──────────────────────────────────────────────────────────
ok(cardComplete({ id: "a", name: "Keke's Breakfast Cafe", rating: 4.7, reviews: 3723 }) === true, "real place passes");
ok(cardComplete({ id: "b", name: "Photo-only Fresh Spot", photos: [{ name: "x" }] }) === true, "named place with a photo passes");
ok(cardComplete({ id: "c", name: "Rated newcomer", rating: 4.9 }) === true, "named + rating passes");
ok(cardComplete({ id: "d", displayName: { text: "Raw Google Row" }, rating: 4.8 }) === false, "un-normalized Google-shaped row (no name) is refused — the Family/All bug");
ok(cardComplete({ id: "e", name: "" }) === false, "empty name refused");
ok(cardComplete({ id: "f", name: "   " }) === false, "whitespace name refused");
ok(cardComplete({ id: "g", name: "Ghost With Nothing" }) === false, "name with zero substance (no rating/reviews/photo) refused");
ok(cardComplete({ name: "No Id Place", rating: 5 }) === false, "missing id refused");
ok(cardComplete(null) === false, "null refused");

// ── PlaceCard enforces it ────────────────────────────────────────────────────
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/function PlaceCard\(\{[^}]*\}\) \{\s*\n\s*if \(!cardComplete\(p\)\) return null;/.test(home),
  "PlaceCard's FIRST act is the completeness gate (if (!cardComplete(p)) return null;)");
ok(/import \{[^}]*cardComplete[^}]*\} from "\.\.\/lib\/score"/.test(home), "home.js imports cardComplete from lib/score");

console.log(`test-card-gate: OK — ${pass} assertions (ghost cards can never render; PlaceCard gate locked)`);
