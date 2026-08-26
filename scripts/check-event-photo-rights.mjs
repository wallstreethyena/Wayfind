// scripts/check-event-photo-rights.mjs — an event photo of a real person may
// only reach a page with a consent record behind it (2026-08-26).
//
// THE EXPOSURE THIS GUARDS. lib/creatorRights.js encodes the owner's own
// 2026-08-06 instruction and the statute behind it: Fla. Stat. 540.08 forbids
// publishing a person's likeness for a commercial purpose without express
// consent, with "a reasonable royalty" among the remedies. That rule was
// enforced for creator avatars only. The first event photo set handed to
// Wayfind (Möbius Sarasota, 2026-08-26) contains identifiable people and would
// have shipped through a completely different code path with nothing checking
// it. lib/eventPhotos.js closes that, and this guard is what keeps it closed —
// asserted on the CALL, per CLAUDE.md.
process.env.WF_SUPPRESS_ANALYTICS = "1";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_PHOTO_SETS, eventPhotos, mayHostEventPhotos, allEventPhotoPaths } from "../lib/eventPhotos.js";
import { claimsAffiliation } from "../lib/creatorRights.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. FAILS CLOSED. Silence is not permission. ─────────────────────────── */
ok(eventPhotos("no-such-event") === null, "an unknown event id yields NO photos");
ok(eventPhotos("") === null && eventPhotos(null) === null && eventPhotos(undefined) === null,
  "empty/null ids yield no photos rather than throwing");
ok(mayHostEventPhotos("no-such-event") === false, "consent defaults to NO for an unregistered event");

/* ── 2. Every registered set carries a real, citable record ──────────────── */
const ids = Object.keys(EVENT_PHOTO_SETS);
ok(ids.length > 0, "the registry is populated (a vacuous guard proves nothing)");
for (const id of ids) {
  const set = EVENT_PHOTO_SETS[id];
  const c = set.consent || {};
  ok(c.photo === true, `${id}: consent.photo must be an explicit true`);
  ok(typeof c.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.on), `${id}: consent carries the date it was obtained`);
  ok(typeof c.record === "string" && c.record.length > 40,
    `${id}: consent.record must describe the ARTEFACT, not merely assert permission — creatorRights.js: "an attestation with no artefact behind it is worth very little in front of a judge"`);
  ok(/\b(dm|email|thread|message|release|signed|instagram\.com|inbox)\b/i.test(c.record),
    `${id}: consent.record must name where the artefact actually lives, so someone else can go find it`);
  ok(typeof c.source === "string" && c.source.length > 2, `${id}: consent names who granted it`);
  // The removal path, offered before anyone has to ask (creatorRights parity).
  ok(typeof c.removal === "string" && c.removal.includes("@"), `${id}: consent carries a removal contact`);
}

/* ── 3. Every hosted file exists, and every image has real alt text ──────── */
const paths = allEventPhotoPaths();
ok(paths.length >= 2, "the registry actually lists image paths");
for (const p of paths) {
  ok(p.src.startsWith("/"), `${p.src} is a same-origin path — we host our own copy, we do not hotlink a partner's CDN`);
  ok(existsSync(path.join(REPO, "public", p.src.replace(/^\//, ""))),
    `${p.src} is referenced by lib/eventPhotos.js but does not exist in public/ — a broken <img> on a partner's event page`);
  ok(typeof p.alt === "string" && p.alt.trim().length >= 20,
    `${p.src} needs descriptive alt text (accessibility, and it is the only thing a screen reader gets)`);
  ok(!/^(photo|image|picture)\b/i.test(p.alt.trim()), `${p.src} alt text must describe the scene, not restate that it is a photo`);
}

/* ── 4. No affiliation claim in a credit line ────────────────────────────── */
// creatorRights.BANNED_AFFILIATION_PHRASES includes "wayfind partner" for a
// Lanham Act s.43(a) reason. A business CAN agree to be called a partner, but
// the phrase must not appear as a rendered claim, and the credit line is
// exactly where it would drift in.
for (const id of ids) {
  const set = EVENT_PHOTO_SETS[id];
  ok(!claimsAffiliation(set.credit || ""), `${id}: the photo credit must not claim affiliation ("${set.credit}")`);
  if (set.creditUrl) ok(/^https:\/\//.test(set.creditUrl), `${id}: creditUrl is https`);
}

/* ── 5. The page may only reach photos THROUGH the consent gate ──────────── */
const PAGE = "app/florida-events/[slug]/page.js";
const src = readFileSync(path.join(REPO, PAGE), "utf8");
// Comments stripped before every source assertion. A guard that can be FAILED
// by its own rationale is a guard someone deletes - this file's first draft
// tripped on the words window.location inside a note explaining why that must
// never be used, the exact trap check-guide-share.mjs records hitting first.
// Only whole-line // comments go, so an inline https:// in real code survives.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(/eventPhotos\(/.test(code), `${PAGE} must resolve photos through eventPhotos()`);
ok(!/["'`]\/events\/[a-z0-9-]+\.(jpg|jpeg|png|webp)["'`]/i.test(code),
  `${PAGE} must not hardcode an /events/*.jpg path — that bypasses the consent gate entirely`);
ok(/alt=\{[^}]*\.alt\}/.test(code), `${PAGE} renders the registry's alt text, never alt=""`);
// The credit must render wherever the strip does: attribution is what the
// organiser gets out of this, and it is half of why the consent holds.
ok(/shots\.credit/.test(code), `${PAGE} must render the photo credit alongside the photos`);

/* ── 6. Structured data uses ABSOLUTE image urls ─────────────────────────── */
// hero_image is now often a same-origin path; a relative url in JSON-LD is
// silently dropped by Google, which is a rich-result regression that no test
// would otherwise catch.
{
  const { eventJsonLd } = await import("../lib/curatedEvents.js");
  const e = {
    event_id: ids[0], event_status: "scheduled", event_name: "Fixture", year: 2026,
    start_date: "2026-08-28", end_date: "2026-08-29", city: "Sarasota", state: "FL",
    venue: "Fixture Venue", is_free: true, hero_image: "/events/does-not-matter.jpg",
  };
  const ld = eventJsonLd(e, { siteUrl: "https://www.gowayfind.com" });
  ok(Array.isArray(ld.image) && ld.image.length > 0, "Event JSON-LD carries images");
  ok(ld.image.every((u) => /^https:\/\//.test(u)), `every JSON-LD image url is absolute (got ${JSON.stringify(ld.image.slice(0, 2))})`);
  ok(new Set(ld.image).size === ld.image.length, "JSON-LD images are de-duplicated");
  ok(ld.image[0].includes(EVENT_PHOTO_SETS[ids[0]].hero.src), "the owned hero leads the image list — it is the one we hold rights to");
}

/* ── 7. THE SHARE CARD IS THE PHOTOGRAPH, and it resolves ───────────────── */
// An event with owned photography previews with that photograph rather than the
// generated text card. Deliberately NOT an <img> inside /api/og: check-share-
// card.mjs bans photography in the generated card (the owner deleted a stock
// sunset that decorated every card, and an <img> is the only thing in a Satori
// render that can fail a fetch mid-response). Pointing metadata at the static
// file needs no renderer, so there is nothing to fail — but it MUST be absolute
// or a scraper will not resolve it (check-og-absolute.mjs).
{
  ok(/SITE_URL \+ shots\.hero\.src/.test(code),
    `${PAGE}: the OG image must be built as SITE_URL + the owned hero path`);
  ok(!/images:\s*\[\{\s*url:\s*["'`]\//.test(code), `${PAGE}: an OG image url must never be a bare relative path`);
  ok(/width:\s*ogW/.test(code) && /height:\s*ogH/.test(code),
    `${PAGE}: OG width/height must follow the real file, not a hardcoded 1200x630 that misdescribes it`);
  // The generated card must still be the fallback: an event with no consented
  // photos may not end up with NO share image at all.
  ok(/\/api\/og\?t=/.test(code), `${PAGE}: events without owned photos must still fall back to the generated card`);
}

/* ── 8. TWO SHARE CONTROLS, UNCONDITIONAL, SERVER-RESOLVED URL ──────────── */
// The rule check-guide-share.mjs proves for guides, applied to events — where
// the case is stronger, because the whole point of "Friday, free, 7pm" is the
// person you are going with.
{
  ok(/import ShareButton from/.test(code), `${PAGE} does not import a share control`);
  const uses = (code.match(/<ShareButton/g) || []).length;
  ok(uses >= 2, `${PAGE} renders ${uses} share control(s) — one near the date for the reader who already knew, one at the foot for the larger group who only know after reading`);
  ok(!/&&\s*<ShareButton/.test(code), `${PAGE}: a share control is behind a condition — it must render on every event`);
  ok(/const shareUrl = SITE_URL \+ "\/florida-events\/" \+ params\.slug/.test(code),
    `${PAGE}: the share URL must be resolved SERVER-side from SITE_URL — built from window.location it carries a preview host the recipient cannot open`);
  ok(!/window\.location/.test(code), `${PAGE} builds a share link from window.location`);
  // Both controls must be distinguishable in analytics, or "shares are flat"
  // and "the top one never gets seen" look identical.
  ok(/placement: "hero"/.test(code) && /placement: "page_end"/.test(code),
    `${PAGE}: each share control must name its placement in the tracked meta`);
  ok((code.match(/event="event_share"/g) || []).length >= 2, `${PAGE}: both controls report the same event name`);
}

if (fail.length) {
  console.error(`check-event-photo-rights: ${fail.length} FAILED (${pass} passed)`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-event-photo-rights: ${pass} assertions passed (${ids.length} consented set(s), ${paths.length} hosted image(s))`);
