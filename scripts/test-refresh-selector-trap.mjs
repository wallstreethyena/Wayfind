#!/usr/bin/env node
// scripts/test-refresh-selector-trap.mjs — a cheap-tier Google check must
// not block the enterprise content refresh that re-dates a row.
//
// THE BUG THIS LOCKS (#1893, Bern's Steak House): the inventory-refresh
// stale-row selector required google_checked_at to be stale. Essentials/pro
// checks stamp google_checked_at WITHOUT moving refreshed_at (only an
// enterprise content patch may re-date it), and search serves inventory on
// refreshed_at alone. Bern's got an essentials check on 2026-10-26 with
// content dated 2026-08-25 and became permanently ineligible for the only
// refresh that could make it visible again — 5,716 OPERATIONAL rows shared
// the trap. EXECUTES lib/inventoryGoogleCheck.js's refreshEligible (the
// predicate the route's PostgREST clause encodes) on fixture rows.
import { readFileSync } from "node:fs";
import { refreshEligible } from "../lib/inventoryGoogleCheck.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const CUTOFF = Date.parse("2026-10-04T00:00:00Z");
const berns = { refreshed_at: "2026-08-25T14:31:26Z", signals: { google_checked_at: "2026-10-26T02:10:43Z", google_check_tier: "essentials", reviews: 9833 } };
ok(refreshEligible(berns, CUTOFF) === true, "Bern's shape (essentials check, stale content) must be eligible for enterprise refresh");
ok(refreshEligible({ refreshed_at: "2026-08-25T14:31:26Z", signals: { google_checked_at: "2026-10-26T02:10:43Z", google_check_tier: "pro" } }, CUTOFF) === true,
  "a recent pro check must also escalate, not block");
ok(refreshEligible({ refreshed_at: "2026-08-25T14:31:26Z", signals: { google_checked_at: "2026-10-26T02:10:43Z", google_check_tier: "enterprise" } }, CUTOFF) === false,
  "a recent enterprise check still throttles re-selection");
ok(refreshEligible({ refreshed_at: "2026-08-25T14:31:26Z", signals: {} }, CUTOFF) === true, "a never-checked stale row stays eligible");
ok(refreshEligible({ refreshed_at: "2026-10-20T00:00:00Z", signals: { google_checked_at: "2026-10-26T02:10:43Z", google_check_tier: "essentials" } }, CUTOFF) === false,
  "fresh content is never selected, whatever the check tier");
ok(refreshEligible({ refreshed_at: "2026-08-25T14:31:26Z", signals: { google_checked_at: "2026-09-01T00:00:00Z", google_check_tier: "enterprise" } }, CUTOFF) === true,
  "an enterprise check older than the cutoff no longer throttles");

// The route's PostgREST clause must encode the same rule (one source
// assertion tying the executed predicate to the shipped query).
const src = readFileSync(new URL("../app/api/cron/inventory-refresh/route.js", import.meta.url), "utf8");
ok(/google_check_tier\.neq\.enterprise/.test(src), "the route selector must carry the tier-escalation clause");
ok(!/\.or\("signals->>google_checked_at\.is\.null,signals->>google_checked_at\.lt\." \+ cutoff\)/.test(src),
  "the old clause (any recent check blocks refresh) must not return");

if (fail.length) { console.error(`test-refresh-selector-trap: FAIL — ${fail.length} problem(s)`); for (const f of fail) console.error("  " + f); process.exit(1); }
console.log(`test-refresh-selector-trap: OK — ${pass} assertions (cheap-tier checks escalate; enterprise checks throttle; fresh content untouched)`);
