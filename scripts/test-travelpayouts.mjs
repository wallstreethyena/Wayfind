// Gate: Travelpayouts deep-link engine (v6.35). LIVE Wave-1 contract + correct
// tp.media/r tracking-param construction. Copies lib to temp .mjs like check-libs.mjs.
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "wf-tp-"));
copyFileSync("lib/travelpayouts.js", join(tmp, "tp.mjs"));
const M = await import(join(tmp, "tp.mjs"));

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("test-travelpayouts: FAIL — " + m); fails++; } };

// ── Wave 1 is LIVE (ids verified in the dashboard 2026-07-15) ────────────────
for (const k of ["tiqets", "klook", "ticketnetwork", "wegotrip"]) ok(M.isTpProgramLive(k) === true, `live: ${k}`);
// ── Wave 2 still ships dark (no ids) ─────────────────────────────────────────
for (const k of ["welcomepickups", "kiwitaxi", "gocity", "radicalstorage", "bikesbooking"]) ok(M.isTpProgramLive(k) === false, `dark: ${k}`);
ok(M.tpDeepLink("gocity", "https://gocity.com") === null, "dark program → null (ships dark until ids)");

// ── The exact dashboard "Full link" format: tp.media/r?campaign_id&marker&p&trs&u ─
const link = M.tpDeepLink("tiqets", "https://www.tiqets.com/en/tampa?x=1", "place_abc!#");
ok(!!link, "live program builds a link");
const u = new URL(link);
ok(u.origin + u.pathname === "https://tp.media/r", "uses tp.media/r redirect endpoint");
ok(u.searchParams.get("marker") === "750791", "marker=750791 (account, NOT the 550160 source id)");
ok(u.searchParams.get("trs") === "550160", "trs=550160 (Gowayfind source)");
ok(u.searchParams.get("campaign_id") === "89", "tiqets campaign_id=89");
ok(u.searchParams.get("p") === "2074", "tiqets p (promo_id)=2074");
ok(u.searchParams.get("sub_id") === "place_abc", "sub_id sanitized (no junk chars)");
ok(u.searchParams.get("u") === "https://www.tiqets.com/en/tampa?x=1", "destination preserved intact in u");

// ── Every live program carries its verified ids ──────────────────────────────
const IDS = { tiqets: ["89", "2074"], klook: ["137", "4110"], ticketnetwork: ["72", "1948"], wegotrip: ["150", "4487"] };
for (const [k, [c, p]] of Object.entries(IDS)) {
  const uu = new URL(M.tpDeepLink(k, M.TP_PROGRAMS[k].home));
  ok(uu.searchParams.get("campaign_id") === c && uu.searchParams.get("p") === p, `${k}: campaign_id=${c} p=${p}`);
}

// ── Guards: never wrap junk ──────────────────────────────────────────────────
ok(M.tpDeepLink("tiqets", "not a url") === null, "invalid destination rejected");
ok(M.tpDeepLink("tiqets", "javascript:alert(1)") === null, "non-http scheme rejected (no junk/xss wrap)");
ok(M.tpDeepLink("nonexistent", "https://x.com") === null, "unknown program rejected");

// ── Readiness snapshot is honest ─────────────────────────────────────────────
const r = M.tpReadiness();
ok(r.marker === "750791" && r.trs === "550160", `readiness marker/trs: ${r.marker}/${r.trs}`);
ok(r.total >= 9 && r.live === 4, `readiness: ${r.total} programs, ${r.live} live`);
ok(M.tpProgramsForCategory("events").length === 1 && M.tpProgramsForCategory("events")[0].key === "ticketnetwork", "events rail = ticketnetwork");

if (fails) { console.error(`test-travelpayouts: ${fails} failure(s)`); process.exit(1); }
console.log("test-travelpayouts: OK — Wave-1 live, tp.media/r params (marker 750791 / trs 550160 / campaign_id / p) + sub_id sanitization + destination integrity verified");
