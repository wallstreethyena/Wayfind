// scripts/test-image-score.mjs — locks the vision card-photo filter (owner: no
// human faces on cards; pick the best shot). The endpoint scores + CACHES per
// ref; the picker is primary-first + non-blocking; PlaceCard uses it.
import { readFileSync } from "fs";
let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── endpoint ──
const ep = read("app/api/image-score/route.js");
ok(/from "\.\.\/\.\.\/\.\.\/lib\/aiKey"/.test(ep) && /from "\.\.\/\.\.\/\.\.\/lib\/serverCache"/.test(ep), "lib imports use the CORRECT depth (3 levels from app/api/image-score — not 4, which broke the prod build)");
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
// SUPERSEDED SHAPE, STRICTER CLAIM (v7.21). This pinned `const MAX = 3` — a
// client-side cap on concurrent REQUESTS. That cap was the bottleneck, not the
// safeguard: a category tap asked for 85 verdicts, 3 at a time, and the last one
// landed 13.3s after the tap (measured on production). It also never actually
// bounded spend — 85 metered vision calls still went out, just three abreast.
//
// The throttle now sits where the money is. The client COALESCES refs into one
// batched request, and the ROUTE caps how many of a batch's misses may reach the
// vision model at all; the rest come back absent and the card keeps its primary
// photo, exactly as it does today when scoring is unavailable. Both halves are
// asserted, so neither the batching nor the spend cap can be removed alone.
const rt = read("app/api/image-score/route.js");
ok(/const BATCH_MS = \d+;/.test(bp) && /const BATCH_MAX = \d+;/.test(bp),
   "the client coalesces verdict requests into a batch (a per-photo request is the 13-second bug)");
ok(/body: JSON\.stringify\(\{ refs: take \}\)/.test(bp),
   "the batched request actually sends the ref LIST — a batch that still posts one ref is not a batch");
ok(/const MAX_SCORE_PER_BATCH = (\d+);/.test(rt) && Number(RegExp.$1) > 0 && Number(RegExp.$1) <= 16,
   "the route caps how many metered vision calls one batch may make (this is the real spend throttle)");
ok(/misses\.slice\(0, MAX_SCORE_PER_BATCH\)/.test(rt),
   "the cap is APPLIED to the miss list, not merely declared");
ok(/cgetMany\(/.test(rt),
   "cached verdicts are read in ONE query — 85 single-row reads is the server half of the same bug");
// An absent score must never be persisted as the neutral default, or a card is
// pinned forever to a photo nothing ever rated.
ok(/waiters\[i\]\.forEach\(\(fn\) => fn\(\{ people: false, aesthetic: 0\.5 \}\)\)/.test(bp),
   "a missing verdict resolves neutral for this render WITHOUT being cached — the ref must stay scoreable later");
ok(/mem\.has\(ref\)/.test(bp), "in-session cache so a photo is fetched once per session too");

// ── PlaceCard integration ──
const home = read("app/home.js");
// v8 (2026-08-15): heroRefFromPlaces left this import with the promo deck's
// hero-photo effects (see scripts/test-hero-people-free.mjs). useBestPhoto —
// the PER-CARD picker this file is actually about — is untouched, and the two
// assertions below still prove it runs before the early return and feeds the
// card's src.
ok(/import \{ useBestPhoto \} from "\.\.\/lib\/bestPhoto"/.test(home), "PlaceCard imports the picker");
// RE-POINTED v8.13.3 (owner: "I don't want any of the place cards not to have
// an image"): useMarketPhotoFallback joins the pre-gate hook block (it too
// must run on every render), and the src ladder gains the stock-scene LAST
// rung — cardPhoto || p.photo || cardMarketFallback. Both invariants this
// file proves are unchanged: the picker runs before the early return, and the
// venue-truthful photo always outranks every fallback.
ok(/const cardPhoto = useBestPhoto\(p && p\.photo, p && p\.photos\);\s*\n\s*(?:\/\/[^\n]*\n\s*)*(?:const cardMarketFallback = useMarketPhotoFallback\([\s\S]{0,300}?\);\s*\n\s*)*(?:\/\/[^\n]*\n\s*)*(?:const cardProduct = usePlaceProduct\([^;]*\);\s*\n\s*)?if \(!cardComplete\(p\)\) return null;/.test(home), "the hook runs BEFORE the early return (rules of hooks)");
ok(/src=\{cardPhoto \|\| p\.photo \|\| cardMarketFallback\}/.test(home), "the card renders the best photo, then the primary, then the stock-scene last rung — venue-truth always first");

console.log(`test-image-score: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
