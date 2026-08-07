#!/usr/bin/env node
/**
 * check-owner-curation-one-path — the owner's editorial weight is applied ONCE.
 *
 * lib/memberSignals.js says it outright: it is "the ONE place the community like
 * signal is aggregated into a ranking input... so the owner's editorial weight
 * and the anonymous-device floor are applied in exactly one choke point (no
 * parallel matchers — the standing lesson)". The path is
 * /api/signals/likes -> aggregateLikeSignals() -> Ranking.memberDelta, and an
 * owner like already counts as weight 50 there.
 *
 * A SECOND path existed anyway, in app/home.js: a `communityBoost()` that read a
 * `place_signals` relation client-side and added +4. Two things were true about
 * it at once, found while auditing the home page on 2026-08-06:
 *
 *   - it never worked. `place_signals` appears in NO commit in this repo's
 *     history and does not exist in the live database (checked
 *     information_schema). The read 404'd on every page load and the rejection
 *     handler set loaded=true, so it never retried. The boost was always 0.
 *   - "fixing" it by creating the relation would have been worse than leaving it
 *     broken: it would apply the owner's like a second time on top of the
 *     weight-50 one, and it would require publishing which account is the
 *     owner's to the anon client — which lib/memberSignals.js forbids in terms
 *     ("ownerId + weight are SERVER env only and are NEVER derived from any
 *     client input").
 *
 * That is the trap this guard exists for. The obvious repair for a 404 is to
 * create the missing thing, and here that instinct builds the forbidden parallel
 * path and double-counts a ranking signal. So this asserts the ABSENCE of the
 * client-side path and the PRESENCE of the server one — an absence assertion
 * alone would be satisfied by deleting owner curation entirely.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
let pass = 0;
const fail = (m) => { console.error("check-owner-curation-one-path: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

// Strip comments before every presence check: this file's own fix is documented
// in a long comment in app/home.js that names `place_signals` and
// `communityBoost` repeatedly, and a raw-source grep would match its own
// explanation. Five guards hit exactly this on 2026-07-30 (CLAUDE.md).
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

const HOME = strip(read("app/home.js"));
const MAP = strip(read("app/components/screens/Map.js"));
const MEMBER = read("lib/memberSignals.js");

/* CONTROL: prove the strip did not empty the files. Without this, every
   "absent" assertion below passes vacuously on an unreadable or over-stripped
   source — the check runs, reads nothing, and answers the wrong question. */
ok(HOME.length > 100000, `app/home.js still has substantial CODE after comment-stripping (${HOME.length} chars) — otherwise the absence checks below prove nothing`);
ok(MAP.length > 5000, `Map.js still has substantial code after stripping (${MAP.length} chars)`);
/* NEGATIVE CONTROL: a token that certainly IS in the stripped code. If this
   fails, the stripper is broken and every absence result is meaningless. */
ok(/featuredBoost/.test(HOME), "the stripped source still contains a known-present identifier (featuredBoost) — confirming the stripper preserves code");

/* ── 1. The client-side second path is gone ─────────────────────────────── */
ok(!/place_signals/.test(HOME),
   "app/home.js does not read a `place_signals` relation. It has never existed in this repo or in the live database; re-adding the read re-adds a guaranteed 404 on every page load");
ok(!/\bcommunityBoost\b/.test(HOME),
   "app/home.js defines no communityBoost() — owner curation must not be recomputed client-side alongside lib/memberSignals.js");
ok(!/\bcommunityBoost\b/.test(MAP),
   "the map screen does not apply a client-side communityBoost() to its pin ordering either");
ok(!/community:\s*communityBoost/.test(HOME),
   "no placeScore() call site passes a client-derived community boost");

/* ── 2. …and the ONE real path is still wired ───────────────────────────── */
ok(/export function aggregateLikeSignals\s*\(/.test(MEMBER),
   "lib/memberSignals.js still EXPORTS aggregateLikeSignals — the single choke point. Asserting only the absence above would be satisfied by deleting owner curation altogether, which is the opposite of the intent");
ok(/ownerId/.test(MEMBER) && /weight/.test(MEMBER),
   "the owner's identity and weight are still parameters of that server-side aggregation");
const ROUTE = read("app/api/signals/likes/route.js");
ok(/aggregateLikeSignals\s*\(/.test(strip(ROUTE)),
   "app/api/signals/likes/route.js CALLS aggregateLikeSignals — the path is wired, not merely defined");
ok(/process\.env\.WF_OWNER_USER_ID/.test(ROUTE),
   "the owner's id comes from server env (WF_OWNER_USER_ID), never from client input — the property that made the deleted client path unshippable even if its table had existed");

/* ── 3. The home feed still CONSUMES that server signal ─────────────────── */
ok(/fetchMemberSignals\s*\(/.test(HOME),
   "app/home.js still calls fetchMemberSignals() — the client consumes the server-computed signal instead of recomputing one");
ok(/\/api\/signals\/likes/.test(HOME) || /signals\/likes/.test(HOME),
   "app/home.js still reaches the /api/signals/likes endpoint that carries the owner weight");

console.log(`check-owner-curation-one-path: OK — ${pass} assertions; owner curation is applied only via /api/signals/likes -> aggregateLikeSignals (weight from server env), and the client-side place_signals/communityBoost path is absent from ${HOME.length} chars of home.js code and ${MAP.length} of Map.js`);
