// scripts/test-image-score.mjs — locks the vision card-photo filter (owner: no
// human faces on cards; pick the best shot). The endpoint scores + CACHES per
// ref; the picker is primary-first + non-blocking; PlaceCard uses it.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── endpoint ──
const ep = read("app/api/image-score/route.js");
ok(/PHOTO_REF\.test\(ref\)/.test(ep), "only a valid Google photo ref is scored");
ok(/"people"/.test(ep) && /"aesthetic"/.test(ep), "asks the model for {people, aesthetic}");
ok(/type: "image", source: \{ type: "url"/.test(ep), "sends the photo to the vision model as an image");
ok(/cget\("?|cget\(ckey\)/.test(ep) && /cset\(ckey, verdict, 30 \* DAY\)/.test(ep), "caches the verdict per ref for 30 days (scored once, ever)");
ok(/aiKey\(\)/.test(ep) && /unavailable: true/.test(ep), "fail-soft when the AI key is absent");
ok(read("middleware.js").includes('"/api/image-score"'), "the metered endpoint is same-origin guarded");

// ── picker: primary-first, non-blocking, ref-only ──
const bp = read("lib/bestPhoto.js");
ok(/const primaryRef = refOf\(primary\);\s*\n\s*if \(!primaryRef\) return;/.test(bp), "no stable ref → leave the primary (live-SDK urls untouched)");
ok(/if \(!pv\.people && pv\.aesthetic >= 0\.45\) return;/.test(bp), "PRIMARY-FIRST: a clean primary stops scoring (bounds cost to ~1 call/card)");
ok(/if \(winner && !winner\.people && winner\.url !== primary\) setBest\(winner\.url\)/.test(bp), "only swaps to a genuinely better, PEOPLE-FREE alternate");
ok(/const MAX = 3;/.test(bp), "vision calls are throttled (concurrency cap)");
ok(/mem\.has\(ref\)/.test(bp), "in-session cache so a photo is fetched once per session too");

// ── PlaceCard integration ──
const home = read("app/home.js");
ok(/import \{ useBestPhoto \} from "\.\.\/lib\/bestPhoto"/.test(home), "PlaceCard imports the picker");
ok(/const cardPhoto = useBestPhoto\(p && p\.photo, p && p\.photos\);\s*\n\s*if \(!cardComplete\(p\)\) return null;/.test(home), "the hook runs BEFORE the early return (rules of hooks)");
ok(/src=\{cardPhoto \|\| p\.photo\}/.test(home), "the card renders the best photo, falling back to the primary");

console.log(`test-image-score: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
