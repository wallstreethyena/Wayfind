#!/usr/bin/env node
// scripts/test-newsletter.mjs — locks the weekly things-to-do email
// (owner order 2026-11-27). Executes the real modules, not regexes, where it
// can; a positive and a negative control per rule.
//
//   1. the send gate: WEEKLY_EMAIL_ENABLED !== "1" returns before ANY network
//      call (fetch is trapped), and with the flag on it does reach the network
//   2. the template: no dashes in copy, unsubscribe link + postal address +
//      why-you-got-this in BOTH html and text, ticket links only through our
//      own /api/<provider>/go redirects, null when nothing real is on
//   3. input rules: email/region/return-path/token validation
//   4. the signup form: plain server form (no "use client"), posts to the
//      subscribe route, carries the honeypot and the consent words
//   5. wiring: middleware guards the subscribe route but NOT unsubscribe (mail
//      apps one-click cross site), the cron is scheduled, the migration turns
//      RLS on and grants anon/authenticated nothing
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(REPO, p), "utf8");
let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

const NL = await import(path.join(REPO, "lib/newsletter.js"));

// ── 3. input rules ─────────────────────────────────────────────────────────
ok(NL.isValidEmail("reader@example.com"), "valid email rejected");
ok(!NL.isValidEmail("not-an-email"), "invalid email accepted");
ok(!NL.isValidEmail("a b@example.com"), "email with a space accepted");
ok(NL.normalizeEmail("  Reader@Example.COM ") === "reader@example.com", "email not normalized");
ok(NL.normalizeRegion("Tampa") === "tampa" && NL.normalizeRegion("atlantis") === null, "region normalization wrong");
ok(NL.safeReturnPath("/florida-events/x") === "/florida-events/x", "same-site path rejected");
for (const bad of ["//evil.com", "https://evil.com", "/\\evil", "javascript:alert(1)", ""]) ok(NL.safeReturnPath(bad) === "/", `unsafe return path kept: ${bad}`);
ok(NL.isUnsubscribeToken("a".repeat(64)) && !NL.isUnsubscribeToken("a".repeat(63)) && !NL.isUnsubscribeToken("G".repeat(64)), "token check wrong");
ok(NL.isoWeek(new Date("2026-11-27T12:00:00Z")) === "2026-W48", "iso week wrong");
ok(NL.regionForCity("st-petersburg") === "tampa" && NL.regionForCity("naples") === "fort-myers" && NL.regionForCity("hawaii") === null, "city to region wrong");
ok(NL.regionForEvent({ state: "FL", county: "Sarasota County", city: "Sarasota" }) === "sarasota", "event to region wrong");
ok(NL.regionForEvent({ state: "TX", city: "Austin" }) === null, "out of state event got a region");
ok(NL.noDashes("Open 5–9 PM — come early - fun") === "Open 5 to 9 PM, come early, fun", "noDashes wrong: " + NL.noDashes("Open 5–9 PM — come early - fun"));

// ── 2. the template ───────────────────────────────────────────────────────
const { weekendRegionByKey } = await import(path.join(REPO, "lib/regionalWeekend.js"));
const region = weekendRegionByKey("tampa");
const base = {
  region, window: { start: "2026-11-27", end: "2026-11-29" }, siteUrl: "https://www.gowayfind.com", week: "2026-W48",
  unsubscribeUrl: "https://www.gowayfind.com/unsubscribe?t=" + "b".repeat(64),
  webUrl: "https://www.gowayfind.com/email/weekly/tampa",
};
const issue = NL.buildWeeklyIssue({
  ...base,
  events: [
    { label: "Wayfind pick", name: "Holiday Lights — Night Market", day: "2026-11-28", where: "Curtis Hixon Park, Tampa", cost: "", detailsHref: "/florida-events/holiday-lights", ticket: { href: "/api/commerce/go?provider=x&offer=1&surface=weekly_email", label: "Get tickets" } },
    { label: "Free admission", name: "Parade", day: "2026-11-29", where: "Downtown", cost: "Free admission", detailsHref: "/florida-events/parade", ticket: { href: "https://partner.example.com/buy", label: "Get tickets" } },
  ],
  places: { eat: [{ name: "Cafe One", where: "Tampa", score: "9.1", href: "/places/abc" }], drink: [], explore: [] },
});
ok(issue && issue.subject && issue.html && issue.text, "issue not built");
const visibleText = (h) => h.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
ok(!/[–—]/.test(issue.subject + visibleText(issue.html) + issue.text), "issue copy carries a dash");
for (const [k, body] of [["html", issue.html], ["text", issue.text]]) {
  ok(body.includes("unsubscribe?t=" + "b".repeat(64)), `${k}: unsubscribe link missing`);
  ok(body.includes("6547 Midnight Pass Rd"), `${k}: postal address missing`);
  ok(/signed up for Wayfind's weekly email|signed up for Wayfind&#39;s weekly email/.test(body), `${k}: why-you-got-this line missing`);
}
ok(issue.html.includes("/api/commerce/go?provider=x"), "our redirect ticket link missing");
ok(!issue.html.includes("partner.example.com") && !issue.text.includes("partner.example.com"), "a raw partner URL reached the email");
ok(/utm_medium=weekly_email/.test(issue.html) && !/api\/commerce\/go\?[^"]*utm_/.test(issue.html), "UTM rules wrong (our pages tagged, redirects untouched)");
// Owner 2026-11-28: "that is not my logo". The header carries his white logo
// (brand vault id wayfind-logo-white), byte for byte, on a dark background,
// and a weekend in the Christmas window wears the site's Christmas colors.
{
  const fs = await import("node:fs");
  const man = JSON.parse(fs.readFileSync(new URL("../public/brand/wayfind/manifest.json", import.meta.url), "utf8"));
  const logo = man.assets.find((a) => a.id === "wayfind-logo-white");
  ok(logo && logo.original === true && logo.path === NL.NEWSLETTER_LOGO.path, "email logo is not the owner's original white logo from the vault");
  ok(Math.abs(NL.NEWSLETTER_LOGO.width / NL.NEWSLETTER_LOGO.height - logo.width / logo.height) < 0.05, "email logo shown at the wrong shape");
  ok(issue.html.includes(`${NL.NEWSLETTER_LOGO.path}" width="${NL.NEWSLETTER_LOGO.width}" height="${NL.NEWSLETTER_LOGO.height}" alt="Wayfind"`), "logo tag lost its size or alt");
  ok(!/wayfind-logo-tagline-black|derived\/wayfind-logo/.test(issue.html), "the old black logo is back in the email");
  ok(/<body bgcolor="#[0-9A-F]{6}"/.test(issue.html) && !/<body[^>]*background:#fff/i.test(issue.html), "email body is not dark (the white logo would vanish)");
  ok(NL.issueTheme("2026-11-27").key === "christmas" && NL.issueTheme("2026-12-31").key === "christmas", "Christmas weeks lost the Christmas look");
  ok(NL.issueTheme("2027-01-02").key === "wayfind" && NL.issueTheme("2026-11-07").key === "wayfind", "the Christmas look leaks outside the season");
  ok(issue.subject.startsWith("🎄 ") && /Your Christmas weekend in Tampa Bay/.test(issue.html), "a Christmas week issue is not festive");
  const off = NL.buildWeeklyIssue({ ...base, window: { start: "2027-01-08", end: "2027-01-10" }, events: [], places: { eat: [{ name: "X", href: "/places/x", score: "9.0" }] } });
  ok(off && !off.subject.includes("🎄") && !/Christmas/.test(off.html), "a January issue still says Christmas");
}
// Owner 2026-11-28: "The email has not pictures does not look premium". A
// hero photo, section photos and event photos, but only photos Wayfind may
// send: every <img> has alt, width and height; Unsplash photos credit the
// photographer; an event photo appears only with a licence or when owned.
{
  const imgs = issue.html.match(/<img\b[^>]*>/g) || [];
  ok(imgs.length >= 3, "the email has almost no pictures");
  ok(imgs.every((t) => /\balt="[^"]+"/.test(t) && /\bwidth="\d+"/.test(t) && /\bheight="\d+"/.test(t)), "an email image lacks alt, width or height");
  ok(imgs.every((t) => /src="https:\/\/(www\.gowayfind\.com|images\.unsplash\.com|[a-z0-9]+\.supabase\.co\/storage\/v1\/render\/image\/public\/place-photos)\//.test(t)), "an email image is not on our domain, our photo vault or Unsplash's host");
  ok(!/\/api\/photo/.test(issue.html), "a Google photo reached the email");
  const hero = NL.EMAIL_PHOTOS.hero.christmas;
  ok(issue.html.includes(hero.src.replace(/&/g, "&amp;")) && issue.html.includes("Photo: " + hero.credit), "Christmas hero photo or its credit missing");
  const { loadComponent: lc } = await import(path.join(REPO, "scripts/lib/jsxLoad.mjs"));
  const ES = await lc(path.join(REPO, "lib/newsletterServer.js"), REPO);
  ok(ES.eventEmailPhoto({ event_id: "x", event_name: "X", hero_image: "/api/photo?ref=places%2Fabc", hero_image_kind: "venue" }) === null, "a Google event photo was allowed in email");
  ok(ES.eventEmailPhoto({ event_id: "selby-lights-in-bloom-2026", event_name: "Lights in Bloom" })?.src === "/events/christmas/selby-lights-in-bloom-2026.jpg", "a licensed event photo was not used");
  const vault = "https://abc.supabase.co/storage/v1/render/image/public/place-photos/x/y.jpg?width=640&resize=contain&quality=75";
  const pp = (o) => ES.placeEmailPhoto("ChIJx", { findPhoto: async () => o });
  const okPhoto = await pp({ url: vault, license: "cc-by-sa-4.0", attributionText: "Jane Doe", attributionUrl: "https://commons.wikimedia.org/x" });
  ok(okPhoto && /width=152&height=152&resize=cover/.test(okPhoto.src) && /Jane Doe, CC BY SA 4\.0/.test(okPhoto.credit), "a licensed vault place photo was not cropped and credited");
  ok(await pp({ url: vault, license: "cc-by-nc-4.0", attributionText: "J", attributionUrl: "https://x" }) === null, "a non commercial licence reached the email");
  ok(await pp({ url: vault, license: "Owner permission on record (2026-10-28)", attributionText: "Owner", attributionUrl: "https://x" }) === null, "a site only owner permission reached the email");
  ok(await pp({ url: "https://upload.wikimedia.org/a.jpg", license: "cc0", attributionText: "J", attributionUrl: "https://x" }) === null, "an uncroppable non vault photo reached the email");
  const withPlace = NL.buildWeeklyIssue({ ...base, events: [], places: { eat: [{ name: "Cafe", where: "Tampa", score: "9.1", href: "/places/a", photo: { ...okPhoto, alt: "Cafe, Tampa" } }, { name: "Diner", where: "Tampa", score: "8.9", href: "/places/b" }] } });
  ok(withPlace.html.includes('width="76" height="76" alt="Cafe, Tampa"') && withPlace.html.includes("Photo: Jane Doe") && /8\.9<div[^>]*>WAYFIND/.test(withPlace.html), "place photo tile or score tile missing");
  const withPhoto = NL.buildWeeklyIssue({ ...base, events: [{ name: "Lights", day: "2026-11-28", detailsHref: "/florida-events/l", photo: { src: "/events/christmas/selby-lights-in-bloom-2026.jpg", alt: "Lights at Selby", credit: "Kimberli · CC BY-SA 4.0" } }], places: {} });
  ok(withPhoto.html.includes('src="https://www.gowayfind.com/events/christmas/selby-lights-in-bloom-2026.jpg"') && withPhoto.html.includes("Photo: Kimberli"), "event photo or its licence credit missing");
}
ok(NL.buildWeeklyIssue({ ...base, events: [], places: {} }) === null, "an empty week built an email");
ok(NL.buildWeeklyIssue({ ...base, events: [], places: { eat: [{ name: "X", href: "/places/x", score: "9.0" }] } }) !== null, "a places-only week built nothing");

// ── 2b. place picks: options, not three of a kind (execute the real picker) ─
{
  const { loadComponent } = await import(path.join(REPO, "scripts/lib/jsxLoad.mjs"));
  const srv = await loadComponent(path.join(REPO, "lib/newsletterServer.js"), REPO);
  const rows = () => [
    { id: "a", name: "Walk-On's Sports Bistreaux - Tampa (Midtown)", rating: 4.8, reviews: 3000, primaryType: "restaurant", types: ["restaurant", "food"] },
    { id: "b", name: "Walk-On's Sports Bistreaux - Brandon", rating: 4.8, reviews: 3000, primaryType: "restaurant", types: ["restaurant", "food"] },
    { id: "c", name: "Escape A", rating: 4.9, reviews: 3000, primaryType: "escape_room", types: ["escape_room", "tourist_attraction"] },
    { id: "d", name: "Escape B", rating: 4.9, reviews: 3000, primaryType: "escape_room", types: ["escape_room", "tourist_attraction"] },
    { id: "e", name: "Lowry Park Zoo", rating: 4.7, reviews: 9000, primaryType: "zoo", types: ["zoo", "tourist_attraction"] },
  ];
  const picks = await srv.regionPlacePicks("tampa", { fetchInventory: async () => rows() });
  const ids = (k) => (picks[k] || []).map((p) => p.href);
  ok(ids("eat").includes("/places/a") && !ids("eat").includes("/places/b"), "chain branch not deduped: " + JSON.stringify(ids("eat")));
  ok(ids("explore").includes("/places/c") && !ids("explore").includes("/places/d") && ids("explore").includes("/places/e"), "explore repeated a place type: " + JSON.stringify(ids("explore")));
  ok((picks.eat || []).every((p) => !/\s[-\u2013\u2014]\s/.test(p.name)), "a place name kept a spaced dash");
}

// ── 1. the send gate (execute the route) ───────────────────────────────────
{
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("[]", { status: 200 }); };
  const env = { ...process.env };
  process.env.CRON_SECRET = "test-secret";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  process.env.RESEND_API_KEY = "re_test";
  // jsxLoad stubs next/cache (lib/weekendEventsRead.js) so plain node can load the real route.
  const { loadComponent } = await import(path.join(REPO, "scripts/lib/jsxLoad.mjs"));
  const route = await loadComponent(path.join(REPO, "app/api/cron/weekly-email/route.js"), REPO).catch((e) => ({ __err: e }));
  if (route.__err) {
    fails.push("cron route did not import: " + route.__err.message);
  } else {
    const req = () => new Request("https://x/api/cron/weekly-email", { headers: { authorization: "Bearer test-secret" } });
    const unauth = await route.GET(new Request("https://x/api/cron/weekly-email"));
    ok(unauth.status === 401, "cron answered without the secret");
    delete process.env.WEEKLY_EMAIL_ENABLED;
    calls = 0;
    const off = await (await route.GET(req())).json();
    ok(off.skipped === "disabled" && calls === 0, `disabled gate made ${calls} network calls or did not skip`);
    process.env.WEEKLY_EMAIL_ENABLED = "true"; // anything but "1" is off
    calls = 0;
    const off2 = await (await route.GET(req())).json();
    ok(off2.skipped === "disabled" && calls === 0, "a non-\"1\" flag value enabled sending");
    process.env.WEEKLY_EMAIL_ENABLED = "1"; // positive control: the gate is a gate, not dead code
    calls = 0;
    await route.GET(req()).catch(() => null);
    ok(calls > 0, "with the flag on the cron never reached the network (gate is dead code?)");
    ok(route.parseEmailAllowlist(" A@x.com, b@y.com ").has("a@x.com") && route.parseEmailAllowlist("") === null, "allowlist parse wrong");
  }
  globalThis.fetch = realFetch;
  for (const k of ["CRON_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "WEEKLY_EMAIL_ENABLED"]) { if (k in env) process.env[k] = env[k]; else delete process.env[k]; }
}

// ── 4. the signup form ─────────────────────────────────────────────────────
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const form = read("app/components/NewsletterSignup.js");
ok(!/^\s*["']use client["']/m.test(form), "NewsletterSignup became a client component (homepage bundle cost)");
ok(/<form[^>]*method="post"[^>]*action="\/api\/newsletter\/subscribe"/.test(form), "form no longer posts to the subscribe route");
ok(/name="website"/.test(form) && /tabIndex=\{-1\}/.test(form), "honeypot missing");
ok(/\{CONSENT_TEXT\}/.test(form), "consent words not shown next to the form");
for (const [file, n] of [["app/page.js", 1], ["app/christmas-in-florida/page.js", 1], ["app/florida-events/[slug]/page.js", 1], ["app/events/[city]/[slug]/page.js", 2], ["lib/landingPage.js", 1], ["app/florida/[town]/page.js", 1]]) {
  const count = (strip(read(file)).match(/<NewsletterSignup[\s/>]/g) || []).length;
  ok(count === n, `${file}: expected ${n} <NewsletterSignup>, found ${count}`);
}

{
  // Homepage: the signup is server markup handed to the client app as a prop
  // and rendered in the home feed, never placed after <Home> (that shows as a
  // loose footer under every app screen) and never imported into home.js.
  const home = strip(read("app/home.js"));
  ok(/\{!browseCat && newsletterSlot\}/.test(home), "home.js no longer renders newsletterSlot in the home feed");
  ok(!/NewsletterSignup/.test(home), "home.js imports the signup component (client bundle cost)");
  ok(/newsletterSlot=\{<NewsletterSignup[\s/>]/.test(strip(read("app/page.js"))), "app/page.js no longer passes the signup into <Home>");
}

// ── 5. wiring ─────────────────────────────────────────────────────────────
const mw = read("middleware.js");
ok(/"\/api\/newsletter\/subscribe"/.test(mw), "subscribe route not behind the middleware guard");
ok(!/"\/api\/newsletter\/unsubscribe"/.test(mw), "unsubscribe route behind the same-origin gate (breaks mail-app one-click)");
const vercel = JSON.parse(read("vercel.json"));
ok(vercel.crons.some((c) => c.path === "/api/cron/weekly-email" && /\* \* 4$/.test(c.schedule)), "weekly cron not scheduled on Thursday");
const sql = read("supabase/migrations/20261127200000_wf_newsletter_subscribers.sql");
ok(/enable row level security/i.test(sql) && /revoke all on table public\.wf_newsletter_subscribers from anon, authenticated/i.test(sql), "migration lost RLS or the anon/authenticated revoke");
ok(!/create policy/i.test(sql), "migration added a policy (the table is service-role only)");
const srv = read("lib/newsletterServer.js");
ok(/List-Unsubscribe-Post/.test(srv) && /oneClickUnsubscribeUrl\(s\.unsubscribe_token\)/.test(srv), "one-click unsubscribe header missing");

if (fails.length) {
  console.error(`test-newsletter: FAIL (${fails.length})\n  - ` + fails.join("\n  - "));
  process.exit(1);
}
console.log(`test-newsletter: OK (${pass} checks: gate executed off/on, template rules, input rules, form, wiring)`);
