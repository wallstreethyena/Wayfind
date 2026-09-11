// lib/pinHealth.js — the SERVER's verdict on whether a founder-pinned partner
// product can still be sold, and the only thing allowed to say a pin is dead.
//
// WHY THIS EXISTS (2026-09-10, the hole in #1238).
//
// #1238 removed 16 pinned Viator products that had vanished from wf_experiences
// and were still painting "Tickets · Viator" buttons that 302'd the customer
// back to our homepage. It also added a credentialed sweep that FAILS the build
// when a pinned code loses its catalogue row. That is detection, and detection
// is not containment:
//
//     the canary goes red  ->  a human retires the pin  ->  a deploy ships
//                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                          customers can click a dead Book button in here
//
// The review that caught this put it exactly right: "Monitoring detects the
// problem; it does not currently quarantine it." So this module closes the
// window. A product that dies in the catalogue stops painting a CTA WITHOUT a
// code change and WITHOUT a deploy.
//
// ── THE ONE DESIGN RULE: DEATH IS ONLY EVER ASSERTED POSITIVELY ──────────
//
// This module returns a list of codes PROVEN not serveable. It never returns a
// list of live codes, and the client never infers death from a code's absence
// from a response. That is not a style choice — it is what makes the whole
// feature safe to put in front of revenue:
//
//   * a truncated response cannot quarantine anything, because quarantine
//     requires a code to be PRESENT in `dead`;
//   * an empty response means "nothing is known to be dead", which is the
//     correct reading of a quiet catalogue;
//   * a failed read returns ok:false and NO list at all, so the client keeps
//     serving exactly what it served before.
//
// The inverse design — shipping the live set and refusing anything missing from
// it — would turn one Supabase hiccup, one truncated page, or one rate limit
// into every Book button on the site disappearing at once. That is a bigger
// revenue bug than the one being fixed, and it would look like the fix working.
//
// UNKNOWN IS NOT DEAD. A 403, a timeout, a rate limit, a never-probed row: all
// of them are OUR failure, never the product's (lib/experienceLinkHealth
// classifies probes the same way). Only two facts kill a pin here:
//   1. the catalogue has no row for it at all;
//   2. the catalogue has a row and the link-health sweep set link_ok = false.
//
// Lives in lib/ rather than in the route so scripts/ can CALL these functions
// against real inputs (CLAUDE.md: "assert on the CALL, not on the string") — a
// Next route module may only export its handler.
import { PLACE_PARTNER_PICKS } from "./placePartnerPicks.js";

/** Codes are alphanumeric by construction (lib/viatorDenylist PRODUCT_CODE_RE). */
const CODE_RE = /^[A-Z0-9]+$/;

/** PostgREST `in.()` slice size. Small enough to keep the URL sane. */
export const PIN_HEALTH_BATCH = 80;

/**
 * PURE. Read the total match count out of a PostgREST Content-Range header
 * (`0-18/19`; an empty result reports a total of 0). Returns null when the header is
 * absent or unparseable — null means "cannot tell", which is treated as no
 * evidence of truncation rather than as proof of it.
 */
export function parseContentRangeTotal(header) {
  const m = String(header || "").match(/\/\s*(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Every Viator product code currently pinned to a place card, upper-cased and
 * de-duplicated. Read from the module rather than a second hand-kept list — a
 * pin the registry gains is a pin this endpoint must answer for.
 */
export function pinnedViatorCodes(picks = PLACE_PARTNER_PICKS) {
  const out = new Set();
  for (const row of picks || []) {
    if (!row || row.provider !== "viator") continue;
    const code = String(row.offerId || "").trim().toUpperCase();
    if (code && CODE_RE.test(code)) out.add(code);
  }
  return [...out];
}

/**
 * PURE. Turn "the codes we asked about" plus "the rows the catalogue returned"
 * into positive death verdicts.
 *
 * @param {string[]} codes  the codes that were ASKED FOR — not a superset. A
 *   code absent from this list is never judged.
 * @param {Array<{product_code?:string, link_ok?:boolean|null}>} rows
 * @returns {Array<{code:string, reason:"absent"|"link-dead"}>}
 */
export function deadVerdicts(codes, rows) {
  const seen = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const c = String((r && r.product_code) || "").trim().toUpperCase();
    if (!c) continue;
    // link_ok is tri-state. Only an explicit false is a verdict; null means the
    // link-health sweep has not reached this row yet, which is not evidence.
    seen.set(c, r && typeof r.link_ok === "boolean" ? r.link_ok : null);
  }
  const out = [];
  for (const raw of Array.isArray(codes) ? codes : []) {
    const code = String(raw || "").trim().toUpperCase();
    if (!code) continue;
    if (!seen.has(code)) { out.push({ code, reason: "absent" }); continue; }
    if (seen.get(code) === false) out.push({ code, reason: "link-dead" });
  }
  return out;
}

/**
 * Read the catalogue and produce the verdict list.
 *
 * @param {object} deps
 * @param {() => ({url:string,key:string}|null)} deps.env
 * @param {typeof fetch} [deps.fetch]
 * @param {string[]} [deps.codes]  override for tests
 * @returns {Promise<{ok:true, dead:Array, pinned:number, checkedAt:string}
 *                 | {ok:false, error:string}>}  never throws.
 *
 * EVERY FAILURE PATH RETURNS ok:false WITH NO LIST. There is deliberately no
 * "partial" answer: `deadVerdicts` derives absence from a row NOT coming back,
 * so a slice that failed would read as a batch of dead products. One bad page
 * poisons the whole answer, so one bad page discards the whole answer.
 */
export async function readPinHealth(deps = {}) {
  const env = typeof deps.env === "function" ? deps.env : () => null;
  const doFetch = deps.fetch || fetch;
  const codes = Array.isArray(deps.codes) ? deps.codes : pinnedViatorCodes();

  if (!codes.length) return { ok: false, error: "no-pins" };
  if (codes.some((c) => !CODE_RE.test(String(c)))) return { ok: false, error: "malformed-code" };

  const s = env();
  if (!s || !s.url || !s.key) return { ok: false, error: "no-supabase-env" };

  const rows = [];
  for (let i = 0; i < codes.length; i += PIN_HEALTH_BATCH) {
    const slice = codes.slice(i, i + PIN_HEALTH_BATCH);
    const url =
      `${s.url}/rest/v1/wf_experiences?select=product_code,link_ok` +
      `&product_code=in.(${slice.join(",")})`;
    let r;
    try {
      // count=exact makes PostgREST report the TRUE match count in
      // Content-Range. Without it a server-side max-rows cap truncates the page
      // silently, and this module derives "absent" from a row not coming back —
      // so a truncated page would read as a batch of dead products and
      // quarantine live inventory. The count is how we can tell the difference.
      r = await doFetch(url, {
        headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, Prefer: "count=exact" },
        cache: "no-store",
      });
    } catch { return { ok: false, error: "fetch-error" }; }
    if (!r || !r.ok) return { ok: false, error: `table-${(r && r.status) || "no-response"}` };
    let batch;
    try { batch = await r.json(); } catch { return { ok: false, error: "bad-json" }; }
    if (!Array.isArray(batch)) return { ok: false, error: "bad-shape" };
    const total = parseContentRangeTotal(r.headers && typeof r.headers.get === "function" ? r.headers.get("content-range") : null);
    if (total !== null && total > batch.length) return { ok: false, error: "truncated-page" };
    rows.push(...batch);
  }

  // POSITIVE CONTROL, served to real users rather than kept in a test. If not a
  // single pinned code came back, the likeliest explanations are a wrong filter
  // shape or an empty table — NOT that every founder-verified product died on
  // the same afternoon. Refusing to answer keeps the client on its previous
  // behaviour; answering would blank every Book button on the site.
  // (This repo has already been bitten once by a filter that matched nothing and
  // read as a real zero: `wf_atlas_stale(..., null, ...)`, 2026-09-09.)
  if (!rows.length) return { ok: false, error: "catalogue-answered-nothing" };

  return {
    ok: true,
    dead: deadVerdicts(codes, rows),
    pinned: codes.length,
    checkedAt: new Date().toISOString(),
  };
}
