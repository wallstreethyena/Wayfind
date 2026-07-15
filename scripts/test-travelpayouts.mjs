// Gate: Travelpayouts deep-link engine (v6.28). Ships-dark contract + correct
// tracking-param construction. Copies lib to temp .mjs like check-libs.mjs.
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "wf-tp-"));
copyFileSync("lib/travelpayouts.js", join(tmp, "tp.mjs"));
const M = await import(join(tmp, "tp.mjs"));

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("test-travelpayouts: FAIL — " + m); fails++; } };

// Ships dark: no program has tracking IDs yet, so every builder returns null.
ok(M.tpDeepLink("tiqets", "https://www.tiqets.com/en/tampa") === null, "tiqets ships dark until IDs pasted");
ok(M.tpBrandLink("klook") === null, "klook brand link dark until IDs");
ok(M.isTpProgramLive("tiqets") === false, "isTpProgramLive false while IDs missing");
ok(M.tpProgramsForCategory("attractions").length === 0, "no live programs in a category yet");

// Readiness snapshot is honest.
const r = M.tpReadiness();
ok(r.marker === "550160", "marker verified 550160: " + r.marker);
ok(r.total >= 9 && r.live === 0, `readiness: ${r.total} programs, ${r.live} live (all pending)`);

// Simulate a program going live to prove the URL construction is correct.
M.TP_PROGRAMS.tiqets.promoId = "9999";
M.TP_PROGRAMS.tiqets.campaignId = "77";
const link = M.tpDeepLink("tiqets", "https://www.tiqets.com/en/tampa?x=1", "place_abc!#");
ok(!!link, "link builds once IDs exist");
const u = new URL(link);
ok(u.origin + u.pathname === "https://tp.media/click", "uses tp.media click endpoint");
ok(u.searchParams.get("shmarker") === "550160", "shmarker present");
ok(u.searchParams.get("promo_id") === "9999", "promo_id present");
ok(u.searchParams.get("campaign_id") === "77", "campaign_id present");
ok(u.searchParams.get("sub_id") === "place_abc", "sub_id sanitized (no junk chars)");
ok(u.searchParams.get("url") === "https://www.tiqets.com/en/tampa?x=1", "destination preserved intact");
ok(M.isTpProgramLive("tiqets") === true, "isTpProgramLive true once IDs set");
ok(M.tpDeepLink("tiqets", "not a url") === null, "invalid destination rejected");
ok(M.tpDeepLink("nonexistent", "https://x.com") === null, "unknown program rejected");
// reset so import side effects don't leak
M.TP_PROGRAMS.tiqets.promoId = null; M.TP_PROGRAMS.tiqets.campaignId = null;

if (fails) { console.error(`test-travelpayouts: ${fails} failure(s)`); process.exit(1); }
console.log("test-travelpayouts: OK — ships-dark contract holds, tp.media params + sub_id sanitization + destination integrity verified");
