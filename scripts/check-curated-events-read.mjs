#!/usr/bin/env node
// scripts/check-curated-events-read.mjs — a FAILED curated list read is not
// an empty queue.
//
// THE DEFECT (production /florida-events, 2026-09). The hub rendered
// "Nothing verified is coming up right now" with JSON-LD numberOfItems:0
// while /florida-events/howl-o-scream-busch-gardens-tampa-2026 still served
// and /api/events near Bradenton still returned that row. fetchCuratedEvents
// had three soft-fails to [] — !supabase, query error, catch — the same []
// as a healthy empty table. The hub then rendered the empty-success page as
// a 200 ISR response (revalidate=3600), which Vercel can cache.
//
// Atlas-build already named this: "A FAILED SELECTOR IS NOT AN EMPTY QUEUE."
// This guard proves the events list read follows the same law BY CALLING IT:
// an outage throws, a healthy empty remains a valid empty, and the hub model
// cannot launder a failed read into the empty copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CuratedEventsUnavailableError,
  fetchCuratedEvents,
  fetchCuratedEventBySlug,
  floridaEventsHubPageModel,
  FLORIDA_EVENTS_HUB_EMPTY_COPY,
  buildRail,
} from "../lib/curatedEvents.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

let n = 0;
const ok = (label, fn) => {
  try {
    fn();
    n++;
  } catch (e) {
    console.error(`check-curated-events-read: FAIL — ${label}\n  ${e.message}`);
    process.exit(1);
  }
};
const okAsync = async (label, fn) => {
  try {
    await fn();
    n++;
  } catch (e) {
    console.error(`check-curated-events-read: FAIL — ${label}\n  ${e.message}`);
    process.exit(1);
  }
};

function mockEventsDb({
  pages = [[]],
  limitError = null,
  rangeError = null,
  rangeErrorOn = null,
  slugRow = null,
  slugError = null,
  throwOn = null,
} = {}) {
  let rangeCalls = 0;
  const result = (payload) => {
    if (throwOn === "query") return Promise.reject(new Error("socket hang up"));
    return Promise.resolve(payload);
  };
  const chain = {
    select() { return chain; },
    in() { return chain; },
    order() { return chain; },
    abortSignal() { return chain; },
    eq() { return chain; },
    limit() {
      if (limitError) return result({ data: null, error: { message: limitError } });
      return result({ data: pages[0] || [], error: null });
    },
    range() {
      rangeCalls += 1;
      if (rangeError && (rangeErrorOn == null || rangeCalls === rangeErrorOn)) {
        return result({ data: null, error: { message: rangeError } });
      }
      return result({ data: pages[rangeCalls - 1] || [], error: null });
    },
    maybeSingle() {
      if (slugError) return result({ data: null, error: { message: slugError } });
      return result({ data: slugRow, error: null });
    },
  };
  return { from() { return chain; } };
}

const NOW = new Date("2026-09-06T12:00:00-04:00");
const RAIL_KEYS = ["this-weekend", "spooky-season", "coming-up"];
const base = {
  event_series_id: "s", city: "Tampa", card_hook: "hook", source_tier: 1,
  verification_confidence: "high", last_verified_at: "2026-09-01",
  event_status: "scheduled", editorial_score: 8, uniqueness_score: 5,
  popularity_score: 5, lat: 27.95, lng: -82.46, audience: [], tags: ["halloween"],
};
const ev = (o) => ({ ...base, ...o });
const howl = ev({
  event_id: "howl-o-scream-tampa-2026",
  event_series_id: "howl",
  event_name: "Howl-O-Scream Busch Gardens Tampa Bay",
  slug: "howl-o-scream-busch-gardens-tampa-2026",
  start_date: "2026-09-11",
  end_date: "2026-10-31",
});

function isUnavailable(err, reason) {
  return err instanceof CuratedEventsUnavailableError && (!reason || err.reason === reason);
}

/* 1 — fetch: outage throws; healthy empty is [] */
await okAsync("!supabase is unavailable, not an empty queue", async () => {
  await assert.rejects(
    () => fetchCuratedEvents({ db: null }),
    (err) => isUnavailable(err, "supabase-unavailable"),
  );
});
await okAsync("a query error is unavailable, not an empty queue", async () => {
  await assert.rejects(
    () => fetchCuratedEvents({ limit: 10, db: mockEventsDb({ limitError: "JWT expired" }) }),
    (err) => isUnavailable(err, "query-error"),
  );
});
await okAsync("a thrown query is unavailable, not an empty queue", async () => {
  await assert.rejects(
    () => fetchCuratedEvents({ db: mockEventsDb({ throwOn: "query" }) }),
    (err) => isUnavailable(err, "query-threw"),
  );
});
await okAsync("a mid-pagination error throws — a partial list is the same silent truncation", async () => {
  const first = Array.from({ length: 500 }, (_, i) => ev({ event_id: "p" + i, event_series_id: "p" + i }));
  await assert.rejects(
    () => fetchCuratedEvents({ db: mockEventsDb({ pages: [first], rangeError: "timeout", rangeErrorOn: 2 }) }),
    (err) => isUnavailable(err, "query-error"),
  );
});
await okAsync("a successful empty list is [] — the honest empty stays valid", async () => {
  const rows = await fetchCuratedEvents({ db: mockEventsDb({ pages: [[]] }) });
  assert.deepEqual(rows, []);
});
await okAsync("a successful list returns the rows", async () => {
  const rows = await fetchCuratedEvents({ limit: 10, db: mockEventsDb({ pages: [[howl]] }) });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_id, howl.event_id);
});
await okAsync("SSG skip is still [] and does not throw (build must not hang)", async () => {
  const prev = process.env.NEXT_PHASE;
  process.env.NEXT_PHASE = "phase-production-build";
  try {
    const rows = await fetchCuratedEvents({ db: null });
    const one = await fetchCuratedEventBySlug("howl-o-scream-busch-gardens-tampa-2026", { db: null });
    assert.deepEqual(rows, []);
    assert.equal(one, null);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = prev;
  }
});

/* 2 — slug: outage throws; honest miss is null */
await okAsync("slug outage throws — a live event must not 404 because the read failed", async () => {
  await assert.rejects(
    () => fetchCuratedEventBySlug("howl-o-scream-busch-gardens-tampa-2026", {
      db: mockEventsDb({ slugError: "connection reset" }),
    }),
    (err) => isUnavailable(err, "query-error"),
  );
});
await okAsync("slug miss is null — the honest 404 stays valid", async () => {
  const row = await fetchCuratedEventBySlug("no-such-event", { db: mockEventsDb({ slugRow: null }) });
  assert.equal(row, null);
});
await okAsync("a paused slug is null, not a throw", async () => {
  const row = await fetchCuratedEventBySlug("paused", {
    db: mockEventsDb({ slugRow: { ...howl, event_status: "paused" } }),
  });
  assert.equal(row, null);
});
await okAsync("a displayable slug returns the row", async () => {
  const row = await fetchCuratedEventBySlug(howl.slug, { db: mockEventsDb({ slugRow: howl }) });
  assert.equal(row.event_id, howl.event_id);
});

/* 3 — hub model: failed read cannot become empty-success; healthy empty can */
ok("a failed read cannot become the empty-success document", () => {
  assert.throws(
    () => floridaEventsHubPageModel({ ok: false, reason: "query-error" }, { now: NOW, railKeys: RAIL_KEYS }),
    (err) => isUnavailable(err, "query-error"),
  );
  assert.throws(
    () => floridaEventsHubPageModel({ ok: true, rows: null }, { now: NOW, railKeys: RAIL_KEYS }),
    (err) => isUnavailable(err, "invalid-read"),
  );
  assert.throws(
    () => floridaEventsHubPageModel(null, { now: NOW, railKeys: RAIL_KEYS }),
    (err) => isUnavailable(err),
  );
});
ok("a healthy empty result is allowed to be empty", () => {
  const model = floridaEventsHubPageModel({ ok: true, rows: [] }, { now: NOW, railKeys: RAIL_KEYS });
  assert.equal(model.skipped, false);
  assert.equal(model.empty, true);
  assert.equal(model.numberOfItems, 0);
  assert.equal(model.rails.length, 0);
});
ok("a thin successful pool (under the 3-card floor) is empty, not an outage", () => {
  assert.equal(buildRail("spooky-season", [howl], { now: NOW }), null);
  const model = floridaEventsHubPageModel({ ok: true, rows: [howl] }, { now: NOW, railKeys: RAIL_KEYS });
  assert.equal(model.empty, true);
  assert.equal(model.numberOfItems, 1);
});
ok("a successful pool ships rails and a non-zero ItemList", () => {
  const pool = [
    howl,
    ev({ event_id: "hhn", event_series_id: "hhn", event_name: "HHN", slug: "hhn", start_date: "2026-08-28", end_date: "2026-11-01" }),
    ev({ event_id: "mnsshp", event_series_id: "mnsshp", event_name: "MNSSHP", slug: "mnsshp", start_date: "2026-08-07", end_date: "2026-10-31" }),
    ev({ event_id: "fantasy", event_series_id: "fantasy", event_name: "Fantasy Fest", slug: "fantasy", start_date: "2026-10-16", end_date: "2026-10-25" }),
  ];
  const model = floridaEventsHubPageModel({ ok: true, rows: pool }, { now: NOW, railKeys: RAIL_KEYS });
  assert.equal(model.empty, false);
  assert.ok(model.numberOfItems >= 3, "eligible count " + model.numberOfItems);
  assert.ok(model.rails.some((r) => r.key === "spooky-season"), model.rails.map((r) => r.key).join(","));
});
ok("an SSG skip is not a healthy empty — no empty copy, no ItemList:0", () => {
  const model = floridaEventsHubPageModel({ ok: true, rows: [] }, { now: NOW, railKeys: RAIL_KEYS, ssg: true });
  assert.equal(model.skipped, true);
  assert.equal(model.empty, false);
  assert.equal(model.numberOfItems, null);
  assert.equal(model.rails.length, 0);
});

/* 4 — the hub page uses the model (role, not substring) and does not catch */
{
  const hub = read("app/florida-events/page.js");
  const hubFn = hub.match(/export default async function FloridaEventsHub\([\s\S]*?\n\}/);
  ok("the hub function is extractable (probe before absence checks)", () => {
    assert.ok(hubFn && hubFn[0].length > 200, "hub function length " + (hubFn && hubFn[0].length));
  });
  ok("the hub fetches then models a successful read — it cannot wrap a failure as ok:true/[]", () => {
    const body = strip(hubFn[0]);
    assert.match(body, /const all = await fetchCuratedEvents\(\)/);
    assert.match(body, /floridaEventsHubPageModel\(\{\s*ok:\s*true,\s*rows:\s*all/);
    assert.doesNotMatch(body, /\bcatch\b/);
    assert.doesNotMatch(body, /\btry\b/);
  });
  ok("the empty copy is gated on model.empty, not on rails.length after a soft-fail []", () => {
    const body = strip(hubFn[0]);
    assert.match(body, /\{model\.empty \? \(/);
    assert.match(body, /FLORIDA_EVENTS_HUB_EMPTY_COPY/);
    assert.doesNotMatch(body, /rails\.length === 0 \?/);
    assert.equal(
      FLORIDA_EVENTS_HUB_EMPTY_COPY,
      "Nothing verified is coming up right now. Rather than pad this page, we have left it empty.",
    );
  });
  ok("JSON-LD ItemList is omitted on an SSG skip — numberOfItems:0 cannot be baked from a skipped read", () => {
    const body = strip(hubFn[0]);
    assert.match(body, /const jsonLd = model\.skipped \? null/);
    assert.match(body, /numberOfItems: model\.numberOfItems/);
    assert.match(body, /\{jsonLd \? <script type="application\/ld\+json"/);
  });
  ok("the hub ISR clock and buildRail's three-card floor are unchanged", () => {
    assert.match(hub, /export const revalidate = 3600/);
    const curated = strip(read("lib/curatedEvents.js"));
    assert.match(curated, /if \(cards\.length < 3\) return null/);
    assert.equal((curated.match(/if \(cards\.length < 3\) return null/g) || []).length, 1);
  });
  ok("the detail page 404s only after a successful miss, not by catching the throw", () => {
    const detail = strip(read("app/florida-events/[slug]/page.js"));
    const pageFn = detail.match(/export default async function CuratedEventPage\([\s\S]*?\n\}/);
    assert.ok(pageFn, "detail page function");
    const head = pageFn[0].slice(0, 500);
    assert.match(head, /const e = await fetchCuratedEventBySlug\(params\.slug\)/);
    assert.match(head, /if \(!e\) notFound\(\)/);
    assert.doesNotMatch(head, /\bcatch\b/);
  });
}

/* 5 — red-prove: wrapping a failed read as {ok:true, rows:[]} WOULD empty-succeed */
ok("RED-PROVE: laundering a failure as a successful [] produces the empty-success the guard forbids", () => {
  const laundered = floridaEventsHubPageModel({ ok: true, rows: [] }, { now: NOW, railKeys: RAIL_KEYS });
  assert.equal(laundered.empty, true, "the sabotage really does produce empty-success");
  assert.equal(laundered.numberOfItems, 0);
  assert.throws(
    () => floridaEventsHubPageModel({ ok: false, reason: "query-error" }, { now: NOW, railKeys: RAIL_KEYS }),
    (err) => isUnavailable(err, "query-error"),
  );
});

console.log(`check-curated-events-read: OK — ${n} assertions; outage throws, healthy empty stays empty, SSG skip is not ItemList:0`);
