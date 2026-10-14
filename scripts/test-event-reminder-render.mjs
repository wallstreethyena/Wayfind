#!/usr/bin/env node
// scripts/test-event-reminder-render.mjs: the "Remind me" button and its sheet,
// RENDERED (jsxLoad + react-dom/server), never grepped.
//
// Owner, 2026-10-14: "add a reminder to the person's phone about the event
// because i would forget ... and ask the user when they would like to be
// reminded."
//
// Proves: the button is hidden for an undated season, a watchlist twin and a
// past event, present for a dated one, on the real RailCard (Christmas rails and
// browse) and the event page control; the sheet asks "When should we remind
// you?", shows the night picker only when there is a choice of nights, hides the
// choices that have already passed, hides "2 hours before" with no start time,
// and carries the Google Calendar link and its alert note; no dashes anywhere a
// person reads. The browser behaviour (focus trap, Esc, 44px targets, the
// download) is checked on the production build, see the PR.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { mergeChristmasResearch } from "../lib/christmasResearch.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { enrichChristmasEvent } from "../lib/christmasPool.js";
import { christmasEventRail } from "../lib/christmasIntentRails.js";
import { reminderFacts, reminderNights } from "../lib/eventReminder.js";
import { siteTodayStr } from "../lib/siteTime.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const h = React.createElement;
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const { default: RemindMe } = await loadComponent(path.join(ROOT, "app/components/RemindMe.js"), ROOT);
const { default: RailCard } = await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT);
const { ChristmasBrowseCard } = await loadComponent(path.join(ROOT, "app/components/ChristmasBrowse.js"), ROOT);

const NOW = Date.parse("2026-10-14T12:00:00Z");
const row = { slug: "test-lights-2026", event_name: "Test Lights", start_date: "2026-11-01", end_date: "2026-11-01", start_time: "18:00:00", end_time: "21:30:00", venue: "Test Park", city: "Tampa", state: "FL", address: "1 Main St", card_hook: "A short test line." };
const nightList = ["2026-11-07", "2026-11-14", "2026-11-16", "2026-11-21", "2026-11-23", "2026-11-28", "2026-12-05", "2026-12-07", "2026-12-12", "2026-12-14", "2027-01-03"];
const F = {
  single: reminderFacts(row),
  list: reminderFacts({ ...row, start_date: nightList[0], end_date: nightList.at(-1), select_nights: true, occurrence_dates: nightList }),
  range: reminderFacts({ ...row, start_date: "2026-11-13", end_date: "2027-01-04", select_nights: true }),
  allDay: reminderFacts({ ...row, start_time: null, end_time: null }),
};
const open = (facts, extra = {}) => renderToStaticMarkup(h(RemindMe, { facts, variant: "card", now: NOW, defaultOpen: true, portal: false, ...extra }));
const closed = (facts, extra = {}) => renderToStaticMarkup(h(RemindMe, { facts, variant: "card", now: NOW, ...extra }));

// ── the button: hidden or present ──────────────────────────────────────────
ok(closed(F.single).includes('class="wf-place-card-remind"') && text(closed(F.single)).trim() === "Remind me", "a dated event shows a 'Remind me' button");
ok(/aria-label="Remind me about Test Lights"/.test(closed(F.single)) && /<svg[^>]+aria-hidden="true"/.test(closed(F.single)), "the button has a bell icon (decorative) and a descriptive accessible name");
ok(closed(null) === "", "no facts, no button");
ok(closed(reminderFacts({ ...row, season_undated: true })) === "", "an undated season shows no button");
ok(closed(reminderFacts({ ...row, start_date: null })) === "", "an event with no start date shows no button");
ok(closed(reminderFacts({ ...row, christmas_watchlist: true })) === "", "a watchlist twin shows no button");
ok(closed(reminderFacts({ ...row, start_date: "2026-10-01", end_date: "2026-10-02" })) === "", "a past event shows no button");
ok(closed(reminderFacts({ ...row, start_date: "2026-09-01", end_date: "2026-12-31", occurrence_dates: ["2026-09-01", "2026-09-08"] })) === "", "a night list that has all gone by shows no button");
ok(closed(reminderFacts({ ...row, start_date: "2026-10-14", end_date: "2026-10-14" })) !== "", "an event today still shows the button");
const pageBtn = closed(F.single, { variant: "page" });
ok(/<button[^>]*aria-label="Remind me about Test Lights"[^>]*style=/.test(pageBtn) && text(pageBtn).trim() === "Remind me" && !/wf-place-card-remind/.test(pageBtn), "the event page variant renders the same button in the page's own style");
ok(!/role="dialog"/.test(closed(F.single)), "the sheet is closed until the button is tapped");

// ── the sheet ──────────────────────────────────────────────────────────────
{
  const html = open(F.single), t = text(html);
  ok(/role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="[^"]+"/.test(html) || /aria-modal="true"[^>]*role="dialog"/.test(html), "the sheet is a modal dialog with a label");
  ok(t.includes("When should we remind you?"), "the sheet asks 'When should we remind you?'");
  ok(/aria-label="Close"/.test(html), "the sheet has a Close button");
  ok(!t.includes("Which night?"), "a single night event does not ask which night");
  for (const label of ["1 week before", "2 days before", "The day before at 6 PM", "The morning of at 9 AM", "2 hours before", "Pick a date and time"]) ok(t.includes(label), `the sheet offers '${label}'`);
  ok(t.includes("Sat Oct 31 at 6:00 PM") && t.includes("Sun Nov 1 at 4:00 PM"), "each choice shows the day and time it will fire");
  ok(/<button[^>]*disabled=""[^>]*data-remind-add[^>]*>Add reminder to my phone<\/button>/.test(html) || /<button[^>]*data-remind-add[^>]*disabled=""[^>]*>Add reminder to my phone<\/button>/.test(html), "'Add reminder to my phone' is disabled until a time is chosen");
  ok(!/href="\/api\/events\/reminder/.test(html), "no download link before a choice");
  const g = /<a href="(https:\/\/calendar\.google\.com\/calendar\/render\?[^"]+)"[^>]*>Use Google Calendar instead<\/a>/.exec(html);
  ok(g && g[1].replace(/&amp;/g, "&").startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE&") && /target="_blank"/.test(html) && /rel="noopener noreferrer"/.test(html), "the secondary link 'Use Google Calendar instead' opens calendar.google.com/calendar/render?action=TEMPLATE in a new tab");
  ok(t.includes("Google uses its own default alert time."), "the sheet says Google uses its own default alert time");
  ok(!/[–—−]|\s-\s/.test(t), "no dashes in the sheet copy");
}
{
  const t = text(open(F.list));
  ok(t.includes("Which night?") && t.includes("Sat Nov 7 at 6:00 PM") && t.includes("Sat Nov 14 at 6:00 PM"), "a select nights event asks 'Which night?' and lists the nights with their start time");
  const radios = (open(F.list).match(/type="radio" name="[^"]*-night"/g) || []).length;
  ok(radios === 8, `the night picker lists the next 8 nights (got ${radios} of ${nightList.length})`);
  ok(t.includes("3 more nights are listed on the event page."), "the picker says how many more nights the event page lists");
  ok(/name="[^"]*-night"[^>]*checked=""/.test(open(F.list)) || /checked=""[^>]*name="[^"]*-night"/.test(open(F.list)), "the next night is preselected");
}
{
  const html = open(F.range), t = text(html);
  ok(t.includes("Which night?") && /<input type="date"[^>]*min="2026-11-13"[^>]*max="2027-01-04"/.test(html.replace(/ aria-labelledby="[^"]*"/, "")) , "a range with no night list shows a date input limited to the range");
  ok(t.includes("Pick the night you plan to go."), "a select nights range tells the person to pick their night");
}
{
  const t = text(open(F.allDay));
  ok(!t.includes("2 hours before"), "'2 hours before' is hidden when the event has no start time");
  ok(t.includes("1 week before") && t.includes("The morning of at 9 AM"), "an all day event still offers the others");
}
// Past choices are hidden.
{
  const at = (iso) => text(open(F.single, { now: Date.parse(iso) }));
  const a = at("2026-10-28T12:00:00Z");
  ok(!a.includes("1 week before") && a.includes("2 days before") && a.includes("The day before at 6 PM"), "after the 1 week mark, '1 week before' is hidden");
  const b = at("2026-10-31T23:00:00Z");
  ok(!b.includes("2 days before") && !b.includes("The day before at 6 PM") && b.includes("The morning of at 9 AM") && b.includes("2 hours before"), "after the evening before, '2 days before' and 'The day before at 6 PM' are hidden");
  const c = at("2026-11-01T15:00:00Z");
  ok(!c.includes("The morning of at 9 AM") && c.includes("2 hours before"), "after 9 AM the morning of, only '2 hours before' is left");
  const d = at("2026-11-01T22:57:00Z");
  ok(d.includes("There is no time left to remind you before this starts.") && !d.includes("Pick a date and time"), "with no time left the sheet says so instead of offering nothing");
}

// ── on the real cards ──────────────────────────────────────────────────────
const TODAY = "2026-10-14";
const realToday = siteTodayStr();
const cards = mergeChristmasResearch([]).filter((e) => christmasEventRail(e)).map((e) => christmasEventCard(enrichChristmasEvent(e, new Map()), { today: TODAY }));
const withFacts = cards.map((card) => ({ card, facts: card.detailHref ? reminderFacts(card) : null }));
const undated = withFacts.filter((x) => x.card.season_undated || !x.card.start_date);
const dated = withFacts.filter((x) => x.facts);
ok(undated.length > 20 && undated.every((x) => x.facts === null), `every undated season card gets no reminder facts (${undated.length} cards)`);
ok(dated.length > 150 && dated.every((x) => x.facts.start_date && x.facts.slug && !x.card.season_undated), `dated cards with a page get facts (${dated.length} cards)`);
const railProps = (card, remind) => ({ photo: null, placeholder: card.tile, photoTile: card.tile, visitFacts: card, title: card.title || card.name, eyebrow: "CHRISTMAS", rank: 1, when: card.when, facts: [card.city], take: card.hook, href: card.detailHref || card.url || null, remind, remindTicketHref: card.ticket?.href || null });
let railChecked = 0, browseChecked = 0;
for (const { card, facts } of [...dated.slice(0, 40), ...undated.slice(0, 20)]) {
  const live = !!facts && reminderNights(facts, realToday).kind !== "none";
  const rail = renderToStaticMarkup(h(RailCard, railProps(card, facts)));
  railChecked++;
  ok(live === /wf-place-card-remind/.test(rail), `${card.id}: the rail card ${live ? "has" : "has no"} Remind me button`);
  if (live) {
    const i = rail.indexOf("wf-place-card-remind"), save = rail.indexOf("wf-place-card-save"), dis = rail.indexOf("wf-place-card-dislike"), share = rail.indexOf("wf-place-card-share");
    ok(save < dis && dis < i && i < share, `${card.id}: Remind me sits in the action row between the reactions and Share`);
  }
  if (!facts) ok(rail === renderToStaticMarkup(h(RailCard, { ...railProps(card, null), remind: undefined, remindTicketHref: undefined })), `${card.id}: with no reminder the card markup is unchanged`);
  const browse = renderToStaticMarkup(h(ChristmasBrowseCard, { card, rank: 1, today: TODAY }));
  browseChecked++;
  ok(live === /wf-place-card-remind/.test(browse), `${card.id}: the browse card ${live ? "has" : "has no"} Remind me button`);
}
ok(railChecked >= 50 && browseChecked >= 50, `real cards rendered (${railChecked} rail, ${browseChecked} browse)`);

// ── wiring, static ─────────────────────────────────────────────────────────
{
  const rails = strip(read("app/components/ChristmasIntentRails.js")), browse = strip(read("app/components/ChristmasBrowse.js")), card = strip(read("app/components/RailCard.js"));
  ok(/remind=\{isEvent && card\.detailHref \? reminderFacts\(card\) : null\}/.test(rails), "the Christmas rails pass reminder facts only for an event with a page");
  ok(/remind=\{card\.detailHref \? reminderFacts\(card\) : null\}/.test(browse), "the Christmas browse passes reminder facts only for a card with a page");
  ok(/\{remind \? <RemindMe facts=\{remind\} variant="card"/.test(card) && /remind = null/.test(card), "RailCard renders the button only when given facts");
  const i = card.indexOf("<RemindMe"), disl = card.indexOf('className={"wf-place-card-dislike"'), share = card.indexOf('className="wf-place-card-share"');
  ok(disl > 0 && i > disl && i < share, "RailCard puts the button between the reactions and Share");
  const page = strip(read("app/florida-events/[slug]/page.js"));
  const sv = page.indexOf("<SaveEventButton"), rm = page.indexOf('<RemindMe facts={remind} variant="page"'), sh = page.indexOf("<ShareButton");
  ok(sv > 0 && rm > sv && rm < sh, "the event page puts Remind me between Save and Share");
  ok(/const remind = reminderFacts\(e, \{ occurrences: occurrenceDatesFor\(e\) \}\);/.test(page), "the event page builds facts from the same row and night list it renders");
  const css = read("app/components/css.js");
  ok(/\.wf-sheet-card-actions:has\(\.wf-place-card-remind\)/.test(css), "the action row grid has room for the fifth control");
  const comp = strip(read("app/components/RemindMe.js"));
  ok(/width: 44, height: 44/.test(comp) && (comp.match(/minHeight: 48/g) || []).length >= 3 && /minHeight: 44/.test(comp), "tap targets are at least 44px (close 44, choices and button 48)");
  ok(/key === "Escape"/.test(comp) && /e\.key !== "Tab"/.test(comp) && /aria-modal="true"/.test(comp) && /STOP/.test(comp), "Escape closes, Tab is trapped, the dialog is modal, and taps do not reach the card");
  ok(/data-remind-backdrop \{\.\.\.STOP\} onClick=\{\(e\) => \{ e\.stopPropagation\(\); if \(e\.target === e\.currentTarget\) onClose\(\); \}\}/.test(comp), "the backdrop closes the sheet on an outside tap (its onClick comes after the propagation guard, which would otherwise replace it)");
  ok(/track\("reminder_open"/.test(comp) && /track\("reminder_set", \{ slug: facts\.slug, preset: result\.preset, days_before: result\.daysBefore/.test(comp), "analytics: reminder_open and reminder_set (preset, days_before, slug) through the existing track helper");
  ok(!/<script|createElement\("script"|googletagmanager|connect\.facebook/.test(comp), "no new third party script");
}

if (fail) { console.log(`test-event-reminder-render: FAIL (${fail} failed, ${pass} passed)`); process.exit(1); }
console.log(`test-event-reminder-render: OK (${pass} assertions: hidden for undated, watchlist and past; present for dated; sheet choices; ${railChecked} real rail cards and ${browseChecked} browse cards)`);
