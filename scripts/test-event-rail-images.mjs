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
// v8.93 — FOLLOWED THE CODE, and each of these got STRICTER on the way.
// The events rail is now four rails in the owner's order (concerts → theater →
// comedy → sports) plus a tail for everything outside them, so the single
// literal aria-label="Events near you" no longer exists on a scroller — it is
// the SECTION heading above them, which is where his v7.09 rename actually
// belongs. The three invariants are unchanged and are now asserted across
// EVERY rail rather than the one that happened to carry the label.
{
  const scrollers = src.match(/className=\{?"wf-rail wf-rail-events"?\}?[\s\S]{0,400}?>/g) || [];
  ok(scrollers.length >= 2, `PROBE: found ${scrollers.length} events scrollers (loading box + at least one live rail)`);
  ok(scrollers.every((t) => /minHeight: EV_RAIL_MIN_H/.test(t)),
    "every live events rail still reserves the shared height constant");
  // The loading box is a skeleton, not a scroller: it has no cards to page
  // through and no RailNav above it, so it correctly carries no data-rail.
  // Scoping to role="region" is what separates "a live rail" from "the box we
  // draw while waiting" — asserting over both would demand an id that would
  // point the arrows at grey blocks.
  const live = scrollers.filter((t) => /role="region"/.test(t));
  ok(live.length >= 1, `PROBE: ${live.length} LIVE events rail(s) among ${scrollers.length} scrollers`);
  ok(live.every((t) => /data-rail=/.test(t)),
    "every live events rail uses the shared .wf-rail scroller and carries a data-rail id (snap + hidden scrollbar in one place, and RailNav's arrows find it)");
  ok(/Events near you/.test(src),
    "the owner's section name survives the split (v7.09: \"Happening near you\" → \"Events near you\")");
}
// v7.03 (owner: "use a sign above the card to let the user know there is more,
// i want the card size to be full"). With full-width cards nothing peeks past
// the edge, so the affordance is no longer implicit and the rail MUST carry an
// explicit one — a card that fills the column with no visible signal that it
// scrolls is a rail nobody scrolls.
ok(/<RailNav railId=\{"events-" \+ g\.key\}/.test(src), "every events rail carries the explicit 'there is more' row above it");
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
// v8.61 — these two matched `logEvent(` for months while `logEvent` was UNBOUND
// inside EventRailCard (declared in PageInner, never passed down). The source
// line existed, the guard was green, and every one of these events threw into a
// catch and fired ZERO times. A source grep cannot tell a live call from a dead
// one — check-unbound-refs now can, and does. Matched on the injected prop.
ok(/onShare=\{shareEvent\}/.test(card) && /onLog\("share", null, \{ id: event\.id, kind: "event_card" \}\)/.test(card), "the share action and its logging survive the restyle");
ok(/onLog\("event_open"/.test(card), "the open-event log is preserved");
ok(/onLog\s*=\s*NOLOG/.test(src) && /<EventRailCard onLog=\{logEvent\}/.test(src), "the rail is actually HANDED a logger — the binding these two assertions assume");
ok(/cta=\{\{/.test(card) && /eventCTA\(event\)/.test(card), "the ticket/details CTA is matched to the event, never a blanket 'Get tickets' on a free community event");
// v7.03: the chips are ATTRIBUTES, never a second printing of the eyebrow. The
// first pass shipped seg.short in both, so every card read "— THEATER ›" above
// "🎭 Theater ›" — the same repeat-the-list's-own-name filler v6.88 deleted
// from the place card.
ok(/label: genre \|\| seg\.short/.test(card), "the chip PREFERS the provider's specific genre and only falls back to the segment when there is nothing more specific");
ok(/const genre = eventGenreLabel\(event, seg\)/.test(card), "…and that genre comes from eventGenreLabel, not from the segment");
// The inverse of the de-duplication fix, and the reason it is a fallback
// rather than a removal: an empty chip row leaves a visible hole in the card.
// Caught on production — Kevin Nealon has genre "" from Ticketmaster, so the
// row rendered with nothing in it between the award band and the ticket CTA.
ok(/\{ key: genre \? "genre" : "segment"/.test(card), "every event card gets at least one chip — a chip-less card renders a hole where the mood row should be");
ok(/GENRE_JUNK/.test(src) && /raw\.length > 22/.test(src), "…and junk genres (Miscellaneous/Other) and over-long comma-packed ones are dropped rather than printed or truncated");

// ── 5. NO LAYOUT SHIFT ──────────────────────────────────────────────────────
ok(/const EV_RAIL_MIN_H = 245/.test(src), "the loading skeleton reserves the live card height — measured on PRODUCTION with the real webfonts, not in a system-font harness");
ok(/\.wf-rail-events>\.wf-rail-card\{min-height:245px\}/.test(css), "…and the live rail pins that SAME number as its card floor, so the two cannot drift apart silently");
{
  // v7.06 — THE SKELETON MOVED WITH THE RAIL. The events rail is now section
  // nine of the home menu (owner, 2026-08-09: "i also want to add events into
  // this list"), so its loading box lives beside it in `eventsRailSlot` rather
  // than in EventsRailSkeleton, which now reserves the promo deck only. The
  // claim is unchanged and is still asserted on the box that actually swaps:
  // same width, same radius, same rail class as the live card.
  // v8.87 — re-anchored: the slot became a thunk (`() => {`) when it moved out
  // of the `screen === "suggested"` IIFE and was finally handed to
  // <DaypartRail eventsSlot>, where it renders. Its loading box is unchanged
  // and every assertion below is the original. The PROBE is what turned this
  // into a one-line fix rather than four silent passes.
  const slotStart = src.indexOf('const eventsRailSlot = (mode = "events") => {');
  ok(slotStart > -1, "PROBE: the events rail is built as eventsRailSlot (if this is -1 the checks below prove nothing)");
  const skel = src.slice(slotStart, src.indexOf("const discoveryMenu = (", slotStart));
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
