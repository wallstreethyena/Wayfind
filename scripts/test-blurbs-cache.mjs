// scripts/test-blurbs-cache.mjs — locks the shared blurbs pool (v6.55):
// one Anthropic generation per place per 30 days for the WHOLE site, honest
// omissions cached briefly, cache served even when the key is down, and the
// evidence-first system prompt intact.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const src = readFileSync(new URL("../app/api/blurbs/route.js", import.meta.url), "utf8");

ok(src.includes('cget("blurb1|" + p.id)'), "per-place shared-pool lookup gone — every device re-bills Anthropic");
ok(src.includes('cset("blurb1|" + p.id, line, line ? 30 * DAY : 3 * DAY)'), "pool write gone or TTLs drifted (lines 30d, omissions 3d)");
ok(/JSON\.stringify\(need\)/.test(src) && !/Places:\\n\$\{JSON\.stringify\(list\)\}/.test(src), "the model must only see UNCACHED places");
ok(src.includes("blurbs: cachedBlurbs, cached: true"), "all-cached fast path gone");
ok(/if \(!key\) return Response\.json\(\{ unavailable: true, blurbs: cachedBlurbs \}/.test(src), "a down key must still serve the pool, never a hard blank");
ok(src.includes("{ ...cachedBlurbs, ...blurbs }"), "fresh lines must merge with pool hits");
ok(src.includes("OMIT it entirely"), "the evidence-first REFUSE-RATHER-THAN-PAD prompt was touched");
ok(src.includes("THE SWAP TEST"), "the swap test left the system prompt");

console.log(`test-blurbs-cache: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
