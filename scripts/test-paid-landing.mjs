// scripts/test-paid-landing.mjs — prebuild gate for the /go/[city] paid route.
//
// Pins the things that make this page worth its ad spend, and the things that
// must NOT change about the organic page it sits beside:
//   - every recommendation is a real link into the app, tracked as detail_open
//   - the quick filters point at deep links the app actually supports
//   - attribution rides every internal navigation
//   - /go is noindex and canonicals to the organic page (no cannibalization)
//   - the organic /things-to-do route and its cached search rows are untouched
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { console.error("test-paid-landing: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const route = read("app/go/[city]/page.js");
const comp = read("app/components/PaidLanding.js");
const landing = read("lib/landing.js");
const organic = read("app/things-to-do/[city]/page.js");

/* ── the route ─────────────────────────────────────────────────────────── */
{
  ok(/index:\s*false/.test(route), "/go/[city] is noindex — it must not compete with the organic page");
  ok(route.indexOf("alternates") >= 0 && route.indexOf("/things-to-do/") >= 0, "canonical points at the organic page");
  ok(route.indexOf("withPhotos: true") >= 0, "the paid route requests photos");
  ok(route.indexOf("generateStaticParams") >= 0, "the route is statically generated per city");
  ok(/revalidate\s*=\s*86400/.test(route), "ISR matches the other landing routes");
  ok(route.indexOf("PaidLanding") >= 0, "the route renders the interactive experience");
  // Link walls must come after the interactive part in source order.
  ok(route.indexOf("<PaidLanding") < route.indexOf("Read the full ranked guide"), "SEO links render BELOW the interactive experience");
}

/* ── above the fold ────────────────────────────────────────────────────── */
{
  ok(comp.indexOf('"use client"') === 0, "PaidLanding is a client component");
  ok(comp.indexOf("Show my 3 best matches") >= 0, "a prominent decision CTA exists");
  for (const f of ["Tonight", "Family day", "Outside", "Orlando icons"]) {
    ok(comp.indexOf(f) >= 0, "decision intent present: " + f);
  }
  ok(/nobody pays to rank/i.test(comp), "benefit/trust language is present");
  ok(/real guest ratings/i.test(comp), "review-honesty language is present");
  ok(comp.indexOf("Show my 3 best matches") < comp.indexOf('className="matches"'), "the CTA sits ABOVE the recommendations");
  for (const image of [
    "orlando-epcot-portrait.jpg", "orlando-roller-coaster-portrait.jpg",
    "orlando-paddleboard-portrait.jpg", "orlando-night-wheel-portrait.jpg",
  ]) ok(comp.indexOf(image) >= 0, "Orlando slideshow includes supplied image: " + image);
  ok(comp.indexOf("wayfind-official-white.png") >= 0, "the supplied official Wayfind logo is used");
  ok((comp.match(/wayfind-official-white\.png/g) || []).length === 1, "the logo appears in the header only, never over the changing photograph");
  ok(comp.indexOf("Orlando is big.") < 0 && comp.indexOf("YOUR LOCAL DECISION CONCIERGE") < 0, "no editorial text overlays the photographs");
  ok(/setInterval\([^]*5000\)/.test(comp), "Orlando hero advances every five seconds");
  ok(comp.indexOf("prefers-reduced-motion: reduce") >= 0, "slideshow respects reduced-motion preferences");
  ok(comp.indexOf("visualControls") >= 0 && comp.indexOf("Show image") >= 0, "slideshow has manual accessible controls");
  ok(comp.indexOf("card-lake-eola-kayaking.jpg") >= 0, "Lake Eola uses the supplied kayaking photograph");
  ok(comp.indexOf("card-harry-p-leu-gardens.jpg") >= 0, "Harry P Leu Gardens uses the supplied garden photograph");
  ok(comp.indexOf("card-great-escape-room.jpg") >= 0, "The Great Escape Room uses the supplied escape-room photograph");
  ok(comp.indexOf("const CURATED_WHY") >= 0, "verified venue facts are explicitly curated");
  ok(comp.indexOf("if (curated) return curated[language] || curated.en") >= 0, "curated facts are used only for known venues");
  ok(/Unknown places keep the quantitative fallback/.test(comp), "unknown venues retain the non-invented quantitative explanation");
}

/* ── cards are real, clickable, and tracked exactly once ───────────────── */
{
  ok(comp.indexOf('`/?place=${encodeURIComponent(active.id)}`') >= 0, "each detail drawer links into the app's detail view");
  ok(comp.indexOf('go("detail_open"') >= 0, "a card click is tracked as detail_open");
  // Decision information.
  for (const [needle, what] of [
    ["place?.photoRef", "photo"], ["place?.rating", "rating"], ["place?.reviews", "review count"],
    ["place?.distMi", "distance"], ["place?.openNow", "hours / open-now"], ["categoryOf(place)", "category"],
  ]) ok(comp.indexOf(needle) >= 0, "cards show " + what);
  ok(comp.indexOf(".match:not(.best) .actions") >= 0, "narrow-card actions stack instead of compressing their labels");

  // One action => one tracking call. `go()` is the only tracker in the
  // component, and it calls track() exactly once.
  const trackCalls = (comp.match(/\btrack\(/g) || []).length;
  ok(trackCalls === 1, "track() is called from exactly one place (the go helper), found " + trackCalls);
  ok(!/posthog\.capture/.test(comp), "the component never captures to PostHog directly (no double-count)");
  ok(!/forwardToGoogle/.test(comp), "the component never calls the Google bridge directly (no double-count)");
  // Navigation must not be blocked on analytics.
  // Match an actual invocation, not the word in a comment.
  ok(!/\.preventDefault\s*\(/.test(comp), "tracking never blocks the navigation the user asked for");
}

/* ── attribution rides every internal navigation ───────────────────────── */
{
  ok(comp.indexOf("decorateHref") >= 0, "internal hrefs are attribution-decorated");
  // Every href on this page must be decorated — a bare href={"/..."} would drop
  // the click ID at exactly the moment attribution matters most.
  const bare = comp.match(/href=\{"\/(?!\/)/g) || [];
  ok(bare.length === 0, "no undecorated internal href literals, found " + bare.length);
  ok(comp.indexOf("captureAttribution") >= 0, "the landing captures attribution on mount");
  ok(comp.indexOf("wf_center") >= 0, "the CTA seeds the app's city so it opens on the right place");

  // HYDRATION SAFETY. decorateHref reads localStorage, which the server does
  // not have. Decorating during the first client render would make a RETURNING
  // paid visitor's markup differ from the server's and blow up hydration —
  // the same class of failure as the 2026-07-25 site-wide outage (3d95dd7).
  // Every href must go through the mount-gated `dh` helper instead.
  ok(!/href=\{decorateHref\(/.test(comp), "no href decorates during render — hydration would mismatch for returning visitors");
  ok(/const \[attr, setAttr\] = useState\(null\)/.test(comp), "attribution starts null so server and first client render agree");
  ok(/const dh = \(href\)/.test(comp), "hrefs route through the mount-gated decorator");
  ok(/if \(!attr\) return href/.test(comp), "the decorator is the identity function before mount");
}

/* ── the organic page is untouched ─────────────────────────────────────── */
{
  ok(organic.indexOf("LandingPage") >= 0, "the organic route still renders the full LandingPage");
  ok(organic.indexOf("noindex") < 0 && !/index:\s*false/.test(organic), "the organic page is still indexable");
  // The SEO cache key must not have moved — a shared key would let the paid
  // page's richer payload overwrite the organic rows (or strip them back).
  ok(landing.indexOf('"wfl1|"') >= 0, "the organic cache-key prefix is unchanged");
  ok(landing.indexOf('"wfl2p|"') >= 0, "the paid payload uses a separate cache key");
  ok(/withPhotos \? "wfl2p\|" : "wfl1\|"/.test(landing), "cache keys are selected by the photo flag");
  // Photos must be opt-in only, so organic pages keep their existing SKU shape.
  ok(/withPhotos \? ",places\.photos/.test(landing), "photos are added ONLY when explicitly requested");
  ok(landing.indexOf("rankedFor(catSlug, citySlug, opts)") >= 0 || /export async function rankedFor\(catSlug, citySlug, opts\)/.test(landing), "rankedFor takes an options bag");
}

/* ── photo proxy safety ────────────────────────────────────────────────── */
{
  ok(/\^places\\\/\[A-Za-z0-9_-\]\+\\\/photos\\\/\[A-Za-z0-9_-\]\+\$/.test(landing) || landing.indexOf("places\\/[A-Za-z0-9_-]+\\/photos\\/[A-Za-z0-9_-]+") >= 0,
    "photo refs are shape-validated at the source (SSRF guard parity with /api/photo)");
  ok(comp.indexOf('`/api/photo?ref=${encodeURIComponent(place.photoRef)}') >= 0, "photos go through the first-party proxy, never a raw Google URL with a key");
}

if (failures) { console.error(`test-paid-landing: ${failures} failure(s)`); process.exit(1); }
console.log("test-paid-landing: OK");
