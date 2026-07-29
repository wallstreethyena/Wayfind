// Gate: Travelpayouts deep-link engine. Four Wave-1 programs are LIVE as of
// 2026-07-29; everything else still ships dark. This suite locks:
//   1. the exact dashboard URL format, including param ORDER
//   2. the marker/trs distinction — the thing that has been confused twice
//   3. that the stale NEXT_PUBLIC_TP_MARKER env var can no longer override
//   4. ships-dark for every program without both IDs
//   5. the http(s)-only protocol guard
//
// Copies lib to a temp .mjs like check-libs.mjs.
import { mkdtempSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "wf-tp-"));
copyFileSync("lib/travelpayouts.js", join(tmp, "tp.mjs"));
const M = await import(join(tmp, "tp.mjs"));
const RAW = readFileSync("lib/travelpayouts.js", "utf8");
// CODE only — comments stripped. The first version of the tp-em.com assertion
// below matched the comment that DOCUMENTS the verification script, so it went
// red on a correct file. A guard that fires on correct code gets disabled, so
// the check must look at what the module DOES, not what it mentions.
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("test-travelpayouts: FAIL — " + m); fails++; } };

// ── 1. the four Wave-1 programs are LIVE ──────────────────────────────────
const WAVE1 = { tiqets: { c: "89", p: "2074" }, klook: { c: "137", p: "4110" }, ticketnetwork: { c: "72", p: "1948" }, wegotrip: { c: "150", p: "4487" } };
for (const [key, ids] of Object.entries(WAVE1)) {
  ok(M.isTpProgramLive(key) === true, `${key} is LIVE`);
  const link = M.tpDeepLink(key, "https://example.com/x");
  ok(!!link, `${key} builds a link`);
  const u = new URL(link);
  ok(u.searchParams.get("campaign_id") === ids.c, `${key} campaign_id=${ids.c} (got ${u.searchParams.get("campaign_id")})`);
  ok(u.searchParams.get("p") === ids.p, `${key} p=${ids.p} (got ${u.searchParams.get("p")})`);
}

// ── 2. the exact dashboard format, param order included ───────────────────
// Order matters here on purpose: this is emitted to match a dashboard link
// character for character, so a diff against one is meaningful.
const link = M.tpDeepLink("tiqets", "https://www.tiqets.com/en/tampa?x=1");
const u = new URL(link);
ok(u.origin + u.pathname === "https://tp.media/r", `endpoint is tp.media/r (got ${u.origin + u.pathname})`);
ok([...u.searchParams.keys()].join(",") === "campaign_id,marker,p,trs,u",
  `param ORDER is campaign_id,marker,p,trs,u (got ${[...u.searchParams.keys()].join(",")})`);
ok(link.startsWith("https://tp.media/r?campaign_id=89&marker=750791&p=2074&trs=550160&u="),
  "emitted prefix matches the dashboard format verbatim");
ok(u.searchParams.get("u") === "https://www.tiqets.com/en/tampa?x=1", "destination preserved intact");

// ── 3. marker vs trs — the distinction that has been confused twice ───────
ok(u.searchParams.get("marker") === "750791", `marker is 750791, the EARNING marker (got ${u.searchParams.get("marker")})`);
ok(u.searchParams.get("trs") === "550160", `trs is 550160, the ACCOUNT id (got ${u.searchParams.get("trs")})`);
ok(M.TP_TRS === "550160", "TP_TRS exported as 550160");
ok(u.searchParams.get("marker") !== u.searchParams.get("trs"), "marker and trs are NOT the same number");
ok(!/marker=550160/.test(link), "550160 never appears as the marker — that would pay the wrong account");
ok(!/shmarker/.test(link), "old shmarker param is gone");
ok(!/tp\.media\/click/.test(link), "old tp.media/click endpoint is gone");

// ── 4. the stale env var cannot override ──────────────────────────────────
// NEXT_PUBLIC_TP_MARKER=550160 is still set in Vercel from the dark period.
// The rename to NEXT_PUBLIC_TP_MARKER_ACCOUNT is what makes it inert; assert
// the OLD name is not read anywhere, or that stale value silently wins.
ok(/NEXT_PUBLIC_TP_MARKER_ACCOUNT/.test(SRC), "reads NEXT_PUBLIC_TP_MARKER_ACCOUNT");
ok(!/process\.env\.NEXT_PUBLIC_TP_MARKER\b/.test(SRC),
  "does NOT read the old NEXT_PUBLIC_TP_MARKER — a stale 550160 there must not override the marker");

// ── 5. app/layout.js is NOT this module's business ────────────────────────
// 550160 is CORRECT in layout.js: tp-em.com/NTUwMTYw.js, NTUwMTYw = base64
// "550160", the site-ownership verification tag. Changing it breaks
// verification. Assert this module never emits that script host.
ok(!/tp-em\.com/.test(SRC), "this module's CODE does not touch the tp-em.com verification script");
ok(/tp-em\.com/.test(RAW), "…but the file still DOCUMENTS why 550160 is correct there — self-test: if this fails the comment was deleted and the next person will 'fix' layout.js again");

// ── 6. everything else still ships dark ───────────────────────────────────
for (const key of ["tripadvisorexperiences", "welcomepickups", "kiwitaxi", "gocity", "radicalstorage", "bikesbooking"]) {
  ok(M.isTpProgramLive(key) === false, `${key} ships DARK`);
  ok(M.tpDeepLink(key, "https://example.com/x") === null, `${key} tpDeepLink returns null`);
  ok(M.tpBrandLink(key) === null, `${key} tpBrandLink returns null`);
}
const r = M.tpReadiness();
ok(r.marker === "750791", `readiness marker 750791 (got ${r.marker})`);
ok(r.live === 4, `exactly 4 programs live (got ${r.live})`);
ok(r.liveKeys.sort().join(",") === "klook,ticketnetwork,tiqets,wegotrip", `live keys are the four Wave-1 (got ${r.liveKeys.join(",")})`);
ok(M.tpProgramsForCategory("attractions").length === 1, "attractions has 1 live program (tiqets)");
ok(M.tpProgramsForCategory("transfers").length === 0, "transfers still has 0 live (Wave 2 dark)");

// ── 7. input guards ───────────────────────────────────────────────────────
ok(M.tpDeepLink("tiqets", "javascript:alert(1)") === null, "javascript: destination rejected by the protocol guard");
ok(M.tpDeepLink("tiqets", "data:text/html,<b>x") === null, "data: destination rejected by the protocol guard");
ok(M.tpDeepLink("tiqets", "ftp://example.com/f") === null, "ftp: destination rejected by the protocol guard");
ok(M.tpDeepLink("tiqets", "https://ok.com/x") !== null, "https destination ACCEPTED — the guard is not blocking everything");
ok(M.tpDeepLink("tiqets", "http://ok.com/x") !== null, "http destination ACCEPTED");
ok(M.tpDeepLink("tiqets", "not a url") === null, "invalid destination rejected");
ok(M.tpDeepLink("nonexistent", "https://x.com") === null, "unknown program rejected");
ok(M.tpDeepLink("tiqets", "") === null, "empty destination rejected");

if (fails) { console.error(`test-travelpayouts: ${fails} failure(s)`); process.exit(1); }
console.log("test-travelpayouts: OK — 4 Wave-1 programs live on the exact dashboard format (tp.media/r, param order locked), marker 750791 distinct from trs 550160, stale NEXT_PUBLIC_TP_MARKER cannot override, 6 programs still dark, protocol guard rejects javascript:/data:/ftp: and accepts http(s)");
