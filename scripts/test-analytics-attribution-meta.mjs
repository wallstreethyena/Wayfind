#!/usr/bin/env node
/**
 * test-analytics-attribution-meta — the first-party rows the Command Center
 * attributes from carry what its readers need (2026-10-02, analytics
 * reconciliation).
 *
 * 1. REFERRERS. The `session` row's meta.ref is read by exactly one consumer,
 *    wf_cc_breakdown 'referrer' (supabase/command-center.sql), which parses it
 *    as a URL host. The emitter used to write the literal "share"/"direct", so
 *    the first-party Referrers panel could never name a referring site. CALLED
 *    here: sessionEntryMeta() and markSessionStart() under real referrer
 *    shapes, asserting the stored meta is { ref: <host or "">, entry }.
 *    Privacy: the host only, never a path, query or token.
 * 2. PARTNER CLICKS. primary_cta_clicked fires for partner CTAs (exact pins,
 *    deals, tracked delivery) AND for plan/directions/menu taps, so the
 *    partner-click count needs meta.monetized. This part is STRUCTURAL ONLY:
 *    the handler runs on a client click, which server rendering cannot invoke.
 *    It asserts the role (the logEvent call inside handlePrimaryCtaClick and
 *    inside addToPlan), not a substring anywhere in the file. The live check
 *    is the contained production click in the release notes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const memory = new Map();
global.sessionStorage = { getItem: (k) => memory.get(k) || null, setItem: (k, v) => memory.set(k, String(v)) };
function setPage({ path: p = "/", search = "", referrer = "" } = {}) {
  global.window = { location: { pathname: p, search } };
  global.document = { referrer };
  memory.clear();
}

const { sessionEntryMeta, markSessionStart } = await import("../lib/shareMetrics.js");

const cases = [
  [{ referrer: "https://www.google.com/search?q=wayfind+orlando" }, { ref: "google.com", entry: "direct" }, "search referral keeps only the host (no query)"],
  [{ referrer: "https://l.instagram.com/?u=https%3A%2F%2Fgowayfind.com%2Fp%2Fabc&e=TOKEN" }, { ref: "l.instagram.com", entry: "direct" }, "social link shim: host only, the token never stored"],
  [{ referrer: "" }, { ref: "", entry: "direct" }, "no referrer -> empty ref (reader shows (direct/none))"],
  [{ path: "/l/orlando-tonight", referrer: "https://www.facebook.com/" }, { ref: "facebook.com", entry: "share" }, "share-link arrival keeps entry=share AND names the site it came from"],
  [{ path: "/", search: "?s=abc", referrer: "" }, { ref: "", entry: "share" }, "share handoff with no referrer"],
  [{ referrer: "not a url" }, { ref: "", entry: "direct" }, "malformed referrer -> empty ref, no throw"],
];
for (const [page, want, msg] of cases) {
  setPage(page);
  const got = sessionEntryMeta();
  ok(JSON.stringify(got) === JSON.stringify(want), `${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// The row actually written by markSessionStart carries that meta.
setPage({ referrer: "https://www.bing.com/search?q=x" });
const written = [];
const accepted = await markSessionStart((action, place, meta) => { written.push({ action, place, meta }); return true; });
ok(accepted === true && written.length === 1, "markSessionStart writes one session row");
ok(written[0] && written[0].action === "session" && written[0].place === null, "the row is the session action");
ok(written[0] && JSON.stringify(written[0].meta) === JSON.stringify({ ref: "bing.com", entry: "direct" }), `session meta stored: ${JSON.stringify(written[0] && written[0].meta)}`);
// The reader's host parse (command-center.sql 'referrer') applied to the new value:
// split_part(regexp_replace(ref,'^https?://',''),'/',1) of a bare host is the host.
const readerHost = (ref) => (String(ref).replace(/^https?:\/\//, "").split("/")[0].toLowerCase() || "(direct/none)");
ok(readerHost(written[0] ? written[0].meta.ref : "") === "bing.com", "the SQL reader's host parse turns the stored ref into the referring site");
ok(readerHost("") === "(direct/none)", "an empty ref reads as (direct/none)");
ok(readerHost("direct") === "direct", "negative control: the OLD literal read as a fake host named 'direct'");

// ── 2. Detail primary CTA meta (structural) ─────────────────────────────────
const src = readFileSync(path.join(ROOT, "app/components/sheets/Detail.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const body = (name) => { const m = src.match(new RegExp(`function ${name}\\s*\\(\\)\\s*\\{([\\s\\S]*?)\\n  \\}`)); return m ? m[1] : ""; };
const primary = body("handlePrimaryCtaClick");
const plan = body("addToPlan");
ok(primary.length > 0 && plan.length > 0, "found handlePrimaryCtaClick and addToPlan bodies (probe positive control)");
ok(/logEvent\("primary_cta_clicked",\s*detail,\s*\{[^}]*\bmonetized:\s*!!primaryCta\.monetized\b[^}]*\}/.test(primary), "handlePrimaryCtaClick logs monetized: !!primaryCta.monetized");
ok(/logEvent\("primary_cta_clicked",\s*detail,\s*\{[^}]*\bexact:\s*!!primaryCta\.exact\b[^}]*\}/.test(primary), "handlePrimaryCtaClick logs exact: !!primaryCta.exact");
ok(/logEvent\("primary_cta_clicked",\s*detail,\s*\{[^}]*cta_type:\s*"add_to_plan"[^}]*\bmonetized:\s*false\b[^}]*\}/.test(plan), "addToPlan logs monetized: false");
const calls = (src.match(/logEvent\("primary_cta_clicked"/g) || []).length;
ok(calls === 2, `exactly 2 primary_cta_clicked emitters in Detail.js, found ${calls}`);

if (fail.length) {
  console.error(`✗ test-analytics-attribution-meta: ${fail.length} failure(s)`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ test-analytics-attribution-meta: ${pass} assertions (sessionEntryMeta + markSessionStart CALLED across ${cases.length} referrer shapes; Detail CTA meta structural)`);
