#!/usr/bin/env node
// The home event rail sells the event with VISIBLE art and, since v7.02, with
// the SAME card the /best-of list uses.
//
// v7.02 (owner, 2026-08-08, with a screenshot of the /best-of card): "this
// image is where the money is at... apply everything else towards that style...
// I want that image leveraged as the style for every card that we offer." The
// bespoke 156px event tile is gone; the rail renders components/RailCard.js,
// which IS the .wf-place-card contract.
//
// This guard follows the code rather than deleting the protection it carried.
// Three things it still has to prove, because each one is a bug that shipped:
//   1. the art is SHOWN, not veiled (the 94%-opaque scrim, the desaturation);
//   2. an event never wears a fabricated Wayfind Score;
//   3. the skeleton reserves the live height, so the swap does not shift.
// And one new one: the rail must not fork a second card component again.
import { readFileSync } from "node:fs";

const src = readFileSync("app/home.js", "utf8");
const rail = readFileSync("app/components/RailCard.js", "utf8");
const css = readFileSync("app/components/css.js", "utf8");
const start = src.indexOf("function EventRailCard");
const end = src.indexOf("// v6.72 — converted from kit's app-chrome palette", start);
const card = start >= 0 && end > start ? src.slice(start, end) : "";
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

ok(card.length > 0, "EventRailCard exists in app/home.js");

// ── 1. ONE CARD. The rail renders the shared component, not a private tile ──
ok(/<RailCard\b/.test(card), "the event card renders through the shared <RailCard>, not a bespoke tile");
ok(!/className="wf-event-share-card"/.test(src), "the old bespoke event tile class is gone — a second card shape is how the page drifted apart the first time");
ok(/className=\{`wf-place-card wf-rail-card/.test(rail), "RailCard renders the canonical .wf-place-card contract, so WF_PLACE_CARD_CSS styles it with no second stylesheet");
for (const cls of ["wf-place-card-layout", "wf-place-card-rank", "wf-place-card-category", "wf-place-card-name", "wf-place-card-meta", "wf-place-card-award", "wf-place-card-highlights", "wf-place-card-actions"]) {
  ok(rail.includes(cls), `RailCard renders .${cls} — the money card's own structure, not a lookalike`);
}
ok(/aria-label="Events near you"[^\n]*minHeight: EV_RAIL_MIN_H/.test(src), "the live rail still reserves the shared height constant");
ok(/className="wf-rail wf-rail-events" data-rail="events"[^\n]*aria-label="Events near you"/.test(src), "the events rail uses the shared .wf-rail scroller (snap + hidden scrollbar in one place)");
// v7.03 (owner: "use a sign above the card to let the user know there is more,
// i want the card size to be full"). With full-width cards nothing peeks past
// the edge, so the affordance is no longer implicit and the rail MUST carry an
// explicit one — a card that fills the column with no visible signal that it
// scrolls is a rail nobody scrolls.
ok(/<RailNav railId="events"/.test(src), "the events rail carries the explicit 'there is more' row above it");
ok(/flex:0 0 100%;\n  width:100%;/.test(css), "rail cards take the full column — the compressed 318px peek is gone");
ok(!/--wf-rail-card-w/.test(css), "…and the old fixed card-width variable is gone with it, so nothing can re-compress the card by setting it");
ok(/\.wf-rail-nav-btn\{/.test(css) && /scrollBy\(\{ left: dir \* rail\.clientWidth/.test(rail), "the arrows are real controls that page the rail by exactly one card width");

// ── 2. THE ART IS SHOWN ──────────────────────────────────────────────────────
ok(/photo=\{railImage\}/.test(card), "the card is given the event's art");
ok(/photoFallback=\{eventUseImage\(event\) \? categoryImage : ""\}/.test(card), "branded category art is the fallback when provider art fails to load");
ok(/objectFit: "cover"/.test(rail), "the art fills its column");
ok(!/rgba\(5,9,15,\.94\)/.test(card) && !/rgba\(5,9,15,\.94\)/.test(rail), "the old 94%-opaque full-image scrim cannot return");
ok(!/filter:\s*"saturate\(\.78\)/.test(card) && !/filter:\s*"saturate\(\.78\)/.test(rail), "the old desaturation cannot return");
ok(!/data-event-art-scrim/.test(card), "no dark scrim panel is layered over the photo — the art is shown, not veiled");

// ── 3. AN EVENT NEVER WEARS A SCORE ─────────────────────────────────────────
// This is the assertion that keeps the restyle honest. The badge box is the
// loudest element on the card; an event is not a rated place, so it gets the
// WHEN badge (a fact it carries) and never a number invented to fill the slot.
ok(!/\bscore=\{/.test(card), "the event card passes NO score — events are not rated places and one must never be fabricated for them");
ok(/when=\{when\}/.test(card), "the badge box carries the WHEN badge instead");
ok(/const tone = /.test(card) && /eventWhenLabel/.test(src), "the badge's urgency tone is derived from the one clock (lib/eventTime), not a second definition of 'soon'");
ok(/score != null\s*\n?\s*\?\s*<div className="wf-place-card-score"><WayfindScoreBadge/.test(rail) || /score != null[\s\S]{0,120}WayfindScoreBadge/.test(rail),
  "RailCard renders the real Wayfind Score badge when — and only when — a score is supplied");
ok(/\.wf-rail-when\{/.test(css) && /data-when-tone="now"/.test(css), "the WHEN badge has its own styling with a date-derived tone");

// ── 4. THE ACTIONS ARE REAL ─────────────────────────────────────────────────
// A card that grows a Save and two thumbs has to make them do something, or
// the restyle traded a working small card for a prettier dead one.
ok(/onSave=\{onSave\}/.test(card) && /saveEventItem\(/.test(src), "Save writes a real row (wf_saved_items, item_type event)");
ok(/item_type: "event"/.test(src), "the saved row is typed as an event so the Saved tab can label it correctly");
ok(/onDislike=\{onDislike\}/.test(card) && /eventSignals\.disliked\[e\.id\] !== true/.test(src), "a dislike genuinely removes the event from the rail — the visible consequence that makes the control honest");
ok(/onShare=\{shareEvent\}/.test(card) && /logEvent\("share", null, \{ id: event\.id, kind: "event_card" \}\)/.test(card), "the share action and its logging survive the restyle");
ok(/logEvent\("event_open"/.test(card), "the open-event log is preserved");
ok(/cta=\{\{/.test(card) && /eventCTA\(event\)/.test(card), "the ticket/details CTA is matched to the event, never a blanket 'Get tickets' on a free community event");
// v7.03: the chips are ATTRIBUTES, never a second printing of the eyebrow. The
// first pass shipped seg.short in both, so every card read "— THEATER ›" above
// "🎭 Theater ›" — the same repeat-the-list's-own-name filler v6.88 deleted
// from the place card.
ok(!/label: seg\.short/.test(card), "no chip merely repeats the eyebrow's own segment label");
ok(/const genre = eventGenreLabel\(event, seg\)/.test(card), "the chip carries the provider's specific genre instead");
ok(/GENRE_JUNK/.test(src) && /raw\.length > 22/.test(src), "…and junk genres (Miscellaneous/Other) and over-long comma-packed ones are dropped rather than printed or truncated");

// ── 5. NO LAYOUT SHIFT ──────────────────────────────────────────────────────
ok(/const EV_RAIL_MIN_H = 245/.test(src), "the loading skeleton reserves the live card height — measured on PRODUCTION with the real webfonts, not in a system-font harness");
ok(/\.wf-rail-events>\.wf-rail-card\{min-height:245px\}/.test(css), "…and the live rail pins that SAME number as its card floor, so the two cannot drift apart silently");
{
  const skel = src.slice(src.indexOf("function EventsRailSkeleton()"), src.indexOf("function HooksBanner"));
  ok(/width: "100%"/.test(skel), "the skeleton blocks are full-width like the live card, so the swap moves nothing sideways either");
  ok(/borderRadius: 17/.test(skel), "…and its corner radius");
  ok(/className="wf-rail wf-rail-events"/.test(skel), "…and the skeleton uses the same rail class as the live row, so gutter, padding and box model are one definition, not two");
}

if (failures.length) {
  console.error("test-event-rail-images: FAIL");
  failures.forEach((failure) => console.error("  - " + failure));
  process.exit(1);
}
console.log("test-event-rail-images: OK — the events rail renders the canonical place card, the art is shown not veiled, no event wears a fabricated score, every action does something, and the skeleton matches the live geometry");
