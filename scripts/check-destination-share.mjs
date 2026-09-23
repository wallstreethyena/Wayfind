// scripts/check-destination-share.mjs — every destination page carries the
// standard Wayfind Share action, over the exact URL of the page it is on.
//
// Owner, 2026-09-23, after verifying the #1464 push flow in the iOS app: the
// Florida Events page a notification opened had no Share button. "I do not want
// this fixed only for one page if the underlying issue is that some destination
// pages never adopted the global share control."
//
// It was that. The share control (app/components/ShareButton.js over
// lib/shareOut.js) existed, but adoption was by memory: the guides and the
// event pages had it, and 20 other destination templates did not, among them
// every city list, all 919 place pages, trending, partners and the Florida
// Events hub. Nothing failed when a destination shipped without one.
//
// So this guard is the rule, not a list of patches:
//
//   1. EVERY app/**/page.js must be classified, as exactly one of:
//        STANDARD    renders <ShareButton url={...}> (itself or via the
//                    renderer it imports), over a server-built canonical URL
//        EQUIVALENT  an older page-level share control that predates this
//                    audit (named, with the label it renders, and a native
//                    sheet call behind it)
//        EXEMPT      not a destination, with the reason proven where it can
//                    be (a hand-off into the app shell must actually hand off)
//      A NEW page that is none of these fails here, by name, until someone
//      decides. That is the part that stops the omission recurring.
//   2. The URL is the PAGE's URL: built by lib/pageShareUrl.js (or a
//      SITE_URL-built const), its path matches the route of the page it is on,
//      and it is never the bare homepage.
//   3. pageShareUrl itself is CALLED, not read: canonical origin, filters kept,
//      tracking and wf_* handoffs dropped, no fragment.
//
// Where the share goes inside the iOS app: WKWebView presents the real iOS
// share sheet for navigator.share. That was measured in the simulator the day
// this guard was written (see lib/shareOut.js header), and it is why the fix is
// adoption, not a second engine.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_URL } from "../lib/site.js";
import { pageShareUrl } from "../lib/pageShareUrl.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const fails = [];
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) fails.push(msg); };
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
// Comments out, strings kept: JSX attribute values are strings, and this guard
// reads JSX. (A commented-out <ShareButton> must not count.)
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

// ── The registry ────────────────────────────────────────────────────────────
// STANDARD: page -> the file that renders its ShareButton, or file#Function when
// a renderer module serves several pages (the button must be in THAT function).
const STANDARD = {
  "app/florida-events/page.js": "app/florida-events/page.js",
  "app/florida-events/[slug]/page.js": "app/florida-events/[slug]/page.js",
  "app/guides/page.js": "app/guides/page.js",
  "app/guides/[slug]/page.js": "app/guides/[slug]/page.js",
  "app/guides/florida-fall-festivals-2026/page.js": "app/guides/florida-fall-festivals-2026/page.js",
  "app/guides/pintos-farm-miami-2026/page.js": "app/guides/pintos-farm-miami-2026/page.js",
  "app/things-to-do/[city]/page.js": "lib/landingShare.js#landingShareAction",
  "app/restaurants/[city]/page.js": "lib/landingShare.js#landingShareAction",
  "app/beaches/[city]/page.js": "lib/landingShare.js#landingShareAction",
  "app/nightlife/[city]/page.js": "lib/landingShare.js#landingShareAction",
  "app/florida/[town]/page.js": "app/florida/[town]/page.js",
  "app/events/[city]/[slug]/page.js": "app/events/[city]/[slug]/page.js",
  "app/culture/[metro]/page.js": "app/culture/[metro]/page.js",
  "app/trending/page.js": "lib/trending.js#TrendingIndexPage",
  "app/trending/[city]/page.js": "lib/trending.js#TrendingCityPage",
  "app/places/page.js": "lib/placePage.js#PlacesIndexPage",
  "app/places/[id]/page.js": "lib/placePage.js#PlacePage",
  "app/eat/[metro]/page.js": "app/eat/[metro]/page.js",
  "app/eat/[metro]/[cuisine]/page.js": "app/eat/[metro]/[cuisine]/page.js",
  "app/creators/page.js": "lib/creatorPages.js#CreatorsIndexPage",
  "app/partners/page.js": "lib/sponsorPage.js#PartnersIndexPage",
  "app/partners/[slug]/page.js": "lib/sponsorPage.js#SponsorPage",
  "app/l/[key]/page.js": "app/l/[key]/page.js",
  "app/summer-picks/page.js": "app/summer-picks/client.js",
  "app/beach-conditions/page.js": "app/beach-conditions/Conditions.js",
};

// EQUIVALENT: page-level share controls that existed before this audit. Each
// is its own button over navigator.share (which is the native iOS sheet in the
// app). Folding them into ShareButton is worthwhile cleanup, but they are not
// missing, so they are pinned here rather than rewritten under a bug fix.
const EQUIVALENT = {
  "app/family/page.js": { via: "app/family/client.js", file: "app/components/FamilyDayPage.js", label: /Share this list/ },
  "app/date-night/page.js": { via: "app/date-night/client.js", file: "app/components/DateNightIntentPage.js", label: /Share this list/ },
  "app/tonight/page.js": { via: "app/tonight/client.js", file: "app/components/NightOutIntentPage.js", label: /Share this list/ },
  "app/trending-now/page.js": { via: "app/trending-now/client.js", file: "app/components/TrendingNowClient.js", label: /Share what's trending/ },
  "app/hidden-gems/page.js": { via: "app/hidden-gems/client.js", file: "app/components/IntentPageClient.js", label: /Share this list/ },
  "app/worth-the-drive/page.js": { via: "app/worth-the-drive/client.js", file: "app/components/IntentPageClient.js", label: /Share this list/ },
  "app/seasonal/page.js": { via: "app/seasonal/client.js", file: "app/components/IntentPageClient.js", label: /Share this list/ },
  "app/quick-bite/page.js": { via: "app/quick-bite/client.js", file: "app/components/IntentPageClient.js", label: /Share this list/ },
  "app/budget/page.js": { via: "app/budget/client.js", file: "app/components/IntentPageClient.js", label: /Share this list/ },
  "app/best-of/page.js": { via: "app/best-of/client.js", file: "app/components/IntentPageClient.js", label: /Share this list/ },
  "app/nearby/page.js": { via: "app/nearby/client.js", file: "app/components/IntentPageClient.js", label: /Share this list/ },
  "app/best-beaches/[metro]/page.js": { via: "app/best-beaches/[metro]/page.js", file: "app/best-beaches/[metro]/parts.js", label: /Share this ranking/ },
  "app/creators/[handle]/page.js": { via: "lib/creatorPages.js", file: "app/components/CreatorShareButton.js", label: /Share this page/ },
};

// EXEMPT: not a destination someone shares. HANDOFF pages must prove they
// hand off (the item then opens inside the app shell, which has its own Share
// on every card and sheet).
const EXEMPT = {
  "app/page.js": { kind: "shell", why: "the app shell itself; every card and sheet in it carries its own share" },
  "app/p/[id]/page.js": { kind: "handoff", why: "opens the place inside the app shell, whose place sheet has Share" },
  "app/r/[rail]/page.js": { kind: "handoff", why: "shared rail card: redirects into the shell with the rail open" },
  "app/s/[code]/page.js": { kind: "handoff", why: "short share code: redirects to the stored target" },
  "app/c/page.js": { kind: "handoff", why: "coupon share landing: redirects into the shell" },
  "app/w/page.js": { kind: "handoff", why: "weather share landing: redirects into the shell" },
  "app/lunch-challenge/page.js": { kind: "handoff", why: "challenge invite: redirects into the shell game" },
  "app/events/[city]/page.js": { kind: "handoff", why: "only ever redirects to /events/[city]/this-weekend" },
  "app/coupons/page.js": { kind: "handoff", why: "route shim: opens the shell's coupons screen" },
  "app/events/page.js": { kind: "handoff", why: "route shim: opens the shell's events screen" },
  "app/map/page.js": { kind: "handoff", why: "route shim: opens the shell's map" },
  "app/favorites/page.js": { kind: "handoff", why: "route shim: a person's own saved places, not a page to send" },
  "app/itinerary/page.js": { kind: "handoff", why: "route shim: a person's own plan, shared from inside the shell" },
  "app/go/[city]/page.js": { kind: "paid", why: "paid-ad landing: one conversion action, and a share would forward the ad click's attribution" },
  "app/go/florida/page.js": { kind: "paid", why: "paid-ad landing (Google Ads): same reason" },
  "app/ask/page.js": { kind: "invite", why: "invite reply page: its primary action already IS a native share of the reply" },
  "app/about/page.js": { kind: "policy", why: "company page, not a destination" },
  "app/privacy/page.js": { kind: "policy", why: "legal page (privacy policy), not a destination" },
  "app/terms/page.js": { kind: "policy", why: "legal page (terms of use), not a destination" },
  "app/editorial-policy/page.js": { kind: "policy", why: "editorial policy page, not a destination" },
  "app/how-wayfind-ranks/page.js": { kind: "policy", why: "methodology page" },
  "app/command-center/page.js": { kind: "internal", why: "owner-only operations console" },
  "app/design/beach-review/page.js": { kind: "internal", why: "internal design review surface" },
  "app/v8/page.js": { kind: "internal", why: "internal rail preview" },
};

// ── 1. Every page is classified, exactly once ───────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = dir + "/" + name;
    if (rel === "app/api") continue;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (name === "page.js") out.push(rel);
  }
  return out;
}
const pages = walk("app").sort();
ok(pages.length > 40 && pages.includes("app/florida-events/page.js"),
  "the page walk found " + pages.length + " pages — it is not reading app/ (positive control: /florida-events must be among them)");
for (const p of pages) {
  const hits = [STANDARD, EQUIVALENT, EXEMPT].filter((r) => Object.prototype.hasOwnProperty.call(r, p)).length;
  ok(hits === 1, hits === 0
    ? p + " is a page this guard has never classified. Decide: does it get the standard <ShareButton> (add it to STANDARD), does it already have its own page share (EQUIVALENT), or is it not a destination (EXEMPT, with the reason)?"
    : p + " is classified " + hits + " times");
}
for (const reg of [STANDARD, EQUIVALENT, EXEMPT]) {
  for (const p of Object.keys(reg)) ok(existsSync(join(ROOT, p)), p + " is in the registry but no longer exists — remove it");
}

// ── 2. STANDARD pages render the ShareButton over the page's own URL ────────
// Detection is by JSX position: an opening <ShareButton tag whose url= prop is
// pageShareUrl(...) or a SITE_URL-built shareUrl const. Proven on fixtures first
// so a regex that matches nothing cannot pass the real files.
const SHARE_JSX = /<ShareButton\b([\s\S]*?)\/>/g;
const shareTags = (src) => Array.from(strip(src).matchAll(SHARE_JSX), (m) => m[1]);
{
  const good = `<ShareButton url={pageShareUrl("/x")} title="x" />`;
  const commented = `{/* <ShareButton url={pageShareUrl("/x")} /> */}`;
  ok(shareTags(good).length === 1, "fixture: the ShareButton detector misses a real tag");
  ok(shareTags(commented).length === 0, "fixture: a commented-out ShareButton is being counted");
  ok(/&&\s*<ShareButton/.test("{x && <ShareButton url={a} />}"), "fixture: the conditional-render probe finds nothing");
}
function routeOf(pageRel) {
  return "/" + pageRel.replace(/^app\//, "").replace(/\/?page\.js$/, "");
}
const staticPrefix = (route) => route.split("/").reduce((acc, seg) => (acc.stop || seg.startsWith("[") ? { ...acc, stop: true } : { s: acc.s + (seg ? "/" + seg : ""), stop: false }), { s: "", stop: false }).s;

// A STANDARD value is "file" or "file#ExportedRenderFunction". With a
// function named, the ShareButton must sit INSIDE that function's body: a
// renderer module that shares on its index page and not on its detail page
// must not pass on the strength of the index page's button.
function fnBody(src, fn) {
  const re = new RegExp("export (?:async )?function " + fn + "\\b");
  const m = re.exec(src);
  if (!m) return null;
  const rest = src.slice(m.index + 1);
  const next = rest.search(/\nexport /);
  return src.slice(m.index, next < 0 ? src.length : m.index + 1 + next);
}
const groups = {};
for (const [page, spec] of Object.entries(STANDARD)) (groups[spec] = groups[spec] || []).push(page);

for (const [spec, served] of Object.entries(groups)) {
  const [renderer, fn] = spec.split("#");
  if (!existsSync(join(ROOT, renderer))) continue;
  const raw = read(renderer);
  const src = strip(raw);
  ok(/import ShareButton from ["'][^"']*components\/ShareButton(?:\.js)?["']/.test(src),
    renderer + " does not import the standard control (app/components/ShareButton.js) — a second share component is exactly what this rule exists to stop");
  let scope = raw;
  if (fn) {
    const body = fnBody(raw, fn);
    ok(body != null, renderer + " has no exported " + fn + " — the registry names a render function that is gone");
    scope = body || "";
  }
  const tags = shareTags(scope);
  ok(tags.length >= 1, spec + " renders no <ShareButton> for " + served.join(", "));
  ok(!/&&\s*<ShareButton/.test(strip(scope)), spec + " hides its ShareButton behind a condition");
  for (const t of tags) {
    const u = t.match(/\burl=\{\s*(pageShareUrl\(([\s\S]*?)\)|shareUrl)\s*\}/);
    ok(!!u, spec + ": a ShareButton's url is neither pageShareUrl(...) nor the SITE_URL-built shareUrl — the url must be the page's own, resolved from the canonical origin");
    if (u && u[1] === "shareUrl") ok(/const shareUrl = SITE_URL \+/.test(src), spec + ": shareUrl is not built from SITE_URL");
    if (u && u[2] != null) {
      const arg = u[2].trim();
      ok(!/^["'`]\/["'`]/.test(arg), spec + ": a destination shares the bare homepage (" + arg + ") — the recipient would land nowhere near this page");
    }
  }
  // The path each page shares is the page's own route: literal paths exactly,
  // dynamic ones by their static prefix.
  const args = tags.map((t) => { const m = t.match(/\burl=\{\s*pageShareUrl\(\s*(["'`])((?:\\.|(?!\1).)*)\1/); return m ? m[2] : null; }).filter((x) => x != null);
  const viaConst = tags.some((t) => /url=\{shareUrl\}/.test(t));
  for (const page of served) {
    const route = routeOf(page);
    const pre = staticPrefix(route);
    const shared = fn === "landingShareAction"
      ? args.includes("/${catSlug}/${citySlug}")
      : route.includes("[")
        ? viaConst || args.some((a) => a.startsWith(pre + "/") || a.startsWith(pre + "${"))
        : viaConst || args.includes(route);
    ok(shared, page + " (route " + route + "): no ShareButton in " + spec + " shares that route — found " + JSON.stringify(args));
    if (renderer !== page) {
      const pageSrc = strip(read(page));
      const base = renderer.replace(/\.js$/, "").split("/").pop();
      const target = fn || base;
      ok(pageSrc.includes(target) && new RegExp("from [\"'][^\"']*" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\.js)?[\"']").test(pageSrc),
        page + " does not render " + spec + ", so the ShareButton there never reaches it");
    }
  }
}

// ── 3. EQUIVALENT controls are real ─────────────────────────────────────────
for (const [page, e] of Object.entries(EQUIVALENT)) {
  const comp = strip(read(e.file));
  ok(e.label.test(comp), page + ": " + e.file + " no longer renders its page share (" + e.label + ") — move this page to STANDARD and give it <ShareButton>");
  ok(/navigator\.share\(|shareOut\(|askShareIntent\(/.test(comp), page + ": " + e.file + " has a share label but no share call behind it");
  const base = e.file.replace(/\.js$/, "").split("/").pop();
  ok(read(e.via).includes(base), page + ": " + e.via + " does not use " + e.file);
}

// ── 4. EXEMPT reasons are true where they can be checked ────────────────────
// A hand-off page must itself RENDER the hand-off (or call redirect()). If it
// renders a local component instead, that component must be what performs the
// navigation. Merely importing ShareRedirect proves nothing: the helper's own
// source contains location.replace, and a first draft of this check read the
// helper into the page and passed a page that no longer rendered it.
const PAGE_HANDOFF = /<ShareRedirect\b|<Redirect\b|<GoScreen\b|<Home\b|\b(?:permanentR|r)edirect\(/;
for (const [page, e] of Object.entries(EXEMPT)) {
  ok(typeof e.why === "string" && e.why.length > 12, page + " is exempt without a reason");
  if (e.kind !== "handoff") continue;
  const src = strip(read(page));
  let proven = PAGE_HANDOFF.test(src);
  if (!proven) {
    for (const m of src.matchAll(/import (\w+) from ["'](\.[^"']+)["']/g)) {
      const [, name, spec] = m;
      if (!new RegExp("<" + name + "\\b").test(src)) continue;
      for (const c of [spec + ".js", spec]) {
        const rel = relative(ROOT, join(ROOT, page, "..", c));
        if (existsSync(join(ROOT, rel)) && statSync(join(ROOT, rel)).isFile()
          && /location\.replace\(|router\.replace\(/.test(strip(read(rel)))) proven = true;
      }
    }
  }
  ok(proven, page + " is exempt as a hand-off into the app shell, but it renders no redirect / shell hand-off — if it now renders its own content, it is a destination");
}
ok(PAGE_HANDOFF.test("return <ShareRedirect to=\"/\" />"), "fixture: the hand-off probe cannot see a rendered ShareRedirect");
ok(!PAGE_HANDOFF.test("import ShareRedirect from \"../ShareRedirect\";\nreturn <main>x</main>;"), "fixture: an unused ShareRedirect import counts as a hand-off");

// ── 4b. The builder stays off the homepage bundle ───────────────────────────
// lib/site.js is imported by the homepage client bundle and is not tree-shaken
// there; when pageShareUrl lived in it, every homepage visitor downloaded it
// (+0.9KB gz, measured, against a 498KB budget with 6.5KB headroom). It lives
// in its own module that only destination pages import.
{
  const siteSrc = strip(read("lib/site.js"));
  const own = strip(read("lib/pageShareUrl.js"));
  ok(/export function pageShareUrl\b/.test(own), "positive control: lib/pageShareUrl.js no longer exports pageShareUrl");
  ok(!/export function pageShareUrl\b/.test(siteSrc), "pageShareUrl is back in lib/site.js, which ships in the homepage bundle");
  for (const shell of ["app/home.js", "app/page.js"]) {
    ok(!/from ["'][^"']*pageShareUrl/.test(strip(read(shell))), shell + " imports pageShareUrl — the homepage has no page-level Share and must not carry the builder");
  }
}

// ── 4a. Legible on the surface it sits on ──────────────────────────────────
// PremiumIntentHero's panel and EditorialLandingHero's action slot (which
// RankedExperiencePage renders) are CREAM. ShareButton's "dark" tone is a light
// label on a transparent pill: on cream it renders as an empty outline. That
// shipped in this PR's first preview on /culture and the city landing pages,
// found in the 390px screenshots, so it is pinned per placement.
{
  const CREAM = {
    "app/culture/[metro]/page.js": "PremiumIntentHero actions",
    "lib/landingShare.js": "PremiumIntentHero actions (via LandingPage)",
    "app/eat/[metro]/page.js": "EditorialLandingHero actionSlot",
    "app/summer-picks/client.js": "RankedExperiencePage actionSlot",
  };
  for (const [f, where] of Object.entries(CREAM)) {
    const tags = shareTags(read(f));
    ok(tags.length > 0, "positive control: no ShareButton found in " + f);
    for (const t of tags) ok(/\btone="hero"/.test(t), f + ": the ShareButton on the cream " + where + " is not tone=\"hero\" — its label would be invisible");
  }
  const onDark = shareTags(read("app/florida-events/page.js"));
  ok(onDark.every((t) => /\btone="dark"/.test(t)), "control: the dark Florida Events page must keep the dark tone");
}

// ── 4c. The city landing pages: built apart, rendered by LandingPage ────────
{
  const landing = strip(read("lib/landing.js"));
  const body = fnBody(landing, "LandingPage") || "";
  ok(/export async function LandingPage\(\{[^}]*\bshareAction\b/.test(landing), "LandingPage no longer takes shareAction — the four city pages lose their Share");
  ok(/<PremiumIntentHero\b[\s\S]*?\bactions=\{shareAction\}/.test(body), "LandingPage does not hand shareAction to the hero's actions slot, so it never renders");
  for (const c of ["things-to-do", "restaurants", "beaches", "nightlife"]) {
    const src = strip(read(`app/${c}/[city]/page.js`));
    ok(new RegExp(`shareAction: landingShareAction\\("${c}", params\\.city\\)`).test(src), `app/${c}/[city]/page.js does not pass its own landingShareAction("${c}", ...) — a wrong category shares the wrong page`);
  }
}

// ── 4d. Nothing on the homepage's import graph brings ShareButton along ─────
// The homepage has no page-level Share (its cards share themselves), and the
// App Router ships every client component reachable from app/page.js in the
// homepage bundle, rendered or not. Walk the real import graph from app/page.js
// (relative imports, app/ and lib/) and prove neither the control nor its URL
// builder is reachable. Positive control: the walk must reach app/home.js and
// lib/landing.js, or it is not walking.
{
  const RESOLVE = [".js", ".jsx", ".mjs", "/index.js", ""];
  const seen = new Set();
  const stack = ["app/page.js"];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    let src;
    try { src = strip(read(f)); } catch (e) { continue; }
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["'](\.{1,2}\/[^"']+)["']|(?:^|\n)\s*import\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const spec = m[1] || m[2];
      for (const ext of RESOLVE) {
        const rel = relative(ROOT, join(ROOT, f, "..", spec + ext));
        if (existsSync(join(ROOT, rel)) && statSync(join(ROOT, rel)).isFile()) { stack.push(rel); break; }
      }
    }
  }
  ok(seen.has("app/home.js") && seen.has("lib/landing.js") && seen.size > 150,
    "positive control: the homepage import walk reached " + seen.size + " files and not app/home.js + lib/landing.js — it is not walking the graph");
  for (const bad of ["app/components/ShareButton.js", "lib/pageShareUrl.js", "lib/landingShare.js"]) {
    ok(!seen.has(bad), bad + " is reachable from app/page.js, so it ships in the homepage bundle (498KB budget) for a page that never renders it");
  }
}

// ── 5. The URL builder, by CALL ─────────────────────────────────────────────
{
  const origin = new URL(SITE_URL).origin;
  ok(pageShareUrl("/florida-events") === origin + "/florida-events", "the Florida Events share is not its own canonical URL: " + pageShareUrl("/florida-events"));
  ok(pageShareUrl("http://localhost:3111/guides?x=1").startsWith(origin + "/guides?x=1"), "a dev/preview host leaks into the share: " + pageShareUrl("http://localhost:3111/guides?x=1"));
  const kept = new URL(pageShareUrl("/l/abc", { v: "7", city: "tampa" }));
  ok(kept.searchParams.get("v") === "7" && kept.searchParams.get("city") === "tampa", "filter context was dropped: " + kept);
  const dropped = new URL(pageShareUrl("/summer-picks", new URLSearchParams("city=tampa&utm_source=ig&gclid=1&fbclid=2&wf_resume=1&_vercel_share=t")));
  ok(dropped.searchParams.get("city") === "tampa", "the positive control (city) did not survive: " + dropped);
  for (const k of ["utm_source", "gclid", "fbclid", "wf_resume", "_vercel_share"]) {
    ok(!dropped.searchParams.has(k), k + " travels with the share — it describes the sender's visit, not the page");
  }
  ok(!pageShareUrl("/guides#top").includes("#"), "a #fragment is part of the shared URL");
  const multi = new URL(pageShareUrl("/x", { tag: ["a", "b"] }));
  ok(multi.searchParams.getAll("tag").join(",") === "a,b", "repeated filter params collapse: " + multi);
  let threw = false;
  try { pageShareUrl(null); pageShareUrl("/y", 42); } catch (e) { threw = true; }
  ok(!threw, "pageShareUrl throws on odd input — it runs while a page renders");
}

if (fails.length) {
  console.error("check-destination-share: FAIL — " + fails.length + "/" + n);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log("check-destination-share: OK — " + n + " assertions; " + pages.length + " pages classified: "
  + Object.keys(STANDARD).length + " destinations render the standard ShareButton over their own route, "
  + Object.keys(EQUIVALENT).length + " keep an older page share, " + Object.keys(EXEMPT).length
  + " are not destinations (every hand-off proven to hand off); pageShareUrl called on 9 inputs");
