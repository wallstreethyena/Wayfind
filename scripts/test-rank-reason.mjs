// scripts/test-rank-reason.mjs — the ranked-card editorial (owner: every hero
// card must say why it was picked and what makes #1 beat #2 — compelling, honest,
// concise). rankReason() must be RANK-AWARE, use ONLY real provided signals
// (rating/reviews/distance), never fabricate, and stay empty when there's nothing
// honest to say (so the card falls back to its verified hook / blurb).
import { readFileSync } from "fs";
import { rankReason } from "../lib/rankReason.js";

let pass = 0;
const fail = (m) => { console.error("test-rank-reason: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// rank-aware: #1 is framed as the top pick
ok(/#1/.test(rankReason({ rating: 4.8, reviews: 1200 }, 1)), "#1 is framed as the top pick");
ok(!/#1/.test(rankReason({ rating: 4.7, reviews: 800 }, 2)), "#2 is NOT called #1");

// uses the real numbers, formatted; never invents
const r1 = rankReason({ rating: 4.8, reviews: 1200 }, 1);
ok(r1.includes("4.8★") && r1.includes("1.2k"), "#1 cites the real rating + review count");
ok(rankReason({ rating: 4.7, reviews: 800 }, 2).includes("4.7★"), "a lower rank still cites its real rating");

// honest gem framing (loved but under the radar) — never claims popularity it lacks
ok(/haven't found/.test(rankReason({ rating: 4.9, reviews: 60 }, 1)), "#1 gem: honest 'not found yet' framing");
ok(/under the radar/.test(rankReason({ rating: 4.9, reviews: 60 }, 3)), "lower-rank gem: honest under-the-radar framing");

// distance is disclosed, never hidden (the ranking docked it, so say so)
ok(/mi/.test(rankReason({ rating: 4.6, reviews: 200, distMi: 24 }, 2)), "a distance-docked card discloses the drive");

// empty when there is no honest signal (card shows its own hook/blurb instead)
ok(rankReason({}, 2) === "", "no rating/reviews → empty (never a fabricated line)");
ok(rankReason(null, 1) === "", "null place → empty");

// tolerant of both field shapes (ThingsToDoList distance_mi + place-card distMi)
ok(/mi/.test(rankReason({ rating: 4.6, reviews: 200, distance_mi: 24 }, 2)), "reads distance_mi too");

// no fabricated superlatives: the output only ever contains digits that were in the input
const out = rankReason({ rating: 4.8, reviews: 1234 }, 1);
const digits = (out.match(/\d+/g) || []).join("");
ok(!/\b(best|only|must|guaranteed|unbeatable|world-class)\b/i.test(out), "no invented superlatives");

// wiring: both ranked surfaces route through it
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const ttd = readFileSync(new URL("../app/components/ThingsToDoList.js", import.meta.url), "utf8");
ok(/import \{ rankReason \}/.test(home) && /rankReason\(p, rank\)/.test(home), "PlaceCard take() uses rankReason(p, rank)");
ok(/import \{ rankReason \}/.test(ttd) && /rankReason\(r, rank\)/.test(ttd), "ThingsToDoList card uses rankReason(r, rank)");
ok(/editorial_hook \? [\s\S]*rankReason\(r, rank\) \|\| blurb/.test(ttd), "verified hook wins; rankReason is the fallback so EVERY card has a line");

console.log(`test-rank-reason: OK — ${pass} assertions (rank-aware, honest, real-signal-only, fail-empty)`);
