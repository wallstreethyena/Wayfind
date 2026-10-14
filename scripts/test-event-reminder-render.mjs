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
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { mergeChristmasResearch } from "../lib/christmasResearch.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { enrichChristmasEvent } from "../lib/christmasPool.js";
import { christmasEventRail } from "../lib/christmasIntentRails.js";
import { reminderNights } from "../lib/eventReminder.js";
import { reminderFactsFor } from "../lib/eventReminderFacts.js";
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
// "today" is pinned to the fixed clock the cases below use (NOW), so the guard never drifts with the calendar.
const reminderFacts = (r) => reminderFactsFor(r, { today: "2026-10-14" });
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
ok(/aria-label="Remind me"/.test(closed(F.single)) && /<svg[^>]+aria-hidden="true"/.test(closed(F.single)) && /<span class="wf-remind-label">Remind me<\/span>/.test(closed(F.single)), "the button has a decorative bell, the visible label 'Remind me' in a span the phone layout can hide, and the accessible name 'Remind me'");
ok(closed(null) === "", "no facts, no button");
ok(closed(reminderFacts({ ...row, season_undated: true })) === "", "an undated season shows no button");
ok(closed(reminderFacts({ ...row, start_date: null })) === "", "an event with no start date shows no button");
ok(closed(reminderFacts({ ...row, christmas_watchlist: true })) === "", "a watchlist twin shows no button");
ok(closed(reminderFacts({ ...row, start_date: "2026-10-01", end_date: "2026-10-02" })) === "", "a past event shows no button");
ok(closed(reminderFacts({ ...row, start_date: "2026-09-01", end_date: "2026-12-31", occurrence_dates: ["2026-09-01", "2026-09-08"] })) === "", "a night list that has all gone by shows no button");
ok(closed(reminderFacts({ ...row, start_date: "2026-10-14", end_date: "2026-10-14" })) !== "", "an event today still shows the button");
const pageBtn = closed(F.single, { variant: "page" });
ok(/<button[^>]*aria-label="Remind me"[^>]*style=/.test(pageBtn) && text(pageBtn).trim() === "Remind me" && !/wf-place-card-remind/.test(pageBtn), "the event page variant renders the same button in the page's own style");
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
  ok(/<button[^>]*disabled=""[^>]*data-remind-add[^>]*>Add to my calendar<\/button>/.test(html) || /<button[^>]*data-remind-add[^>]*disabled=""[^>]*>Add to my calendar<\/button>/.test(html), "'Add to my calendar' is disabled until a time is chosen");
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

// ── the button on Fall, Halloween and Christmas dated cards; absent on undated, past, canceled ──────────
{
  const registries = await Promise.all(["fallDiscoveries2026", "fallFeaturedFestivals2026", "fallGapFill20261007", "fallFoodGap20261008", "fallTampaPicks20261008"].map((f) => import("../lib/" + f + ".js")));
  const FALL_ROWS = registries.flatMap((m) => Object.values(m).find(Array.isArray) || []);
  const { addDays } = await import("../lib/eventReminder.js");
  const realRow = (id) => FALL_ROWS.find((r) => r.event_id === id);
  const fruitville = realRow("fruitville-grove-pumpkin-2026"), mangoni = realRow("haunted-mangoni-2026");
  ok(!!fruitville && !!mangoni && fruitville.occurrence_dates.length > 5, "PROBE: the real Fall registry rows (Fruitville Grove Pumpkin Festival, Haunted Mangoni) exist");
  // Real rows, dates moved to start 10 days from the real today so the guard never rots with the calendar.
  const shift = (row, days) => {
    const first = row.occurrence_dates && row.occurrence_dates.length ? row.occurrence_dates[0] : row.start_date;
    const delta = Math.round((Date.parse(addDays(realToday, days)) - Date.parse(first)) / 86400000);
    const mv = (d) => (d ? addDays(d, delta) : d);
    return { ...row, start_date: mv(row.start_date), end_date: mv(row.end_date), occurrence_dates: row.occurrence_dates ? row.occurrence_dates.map(mv) : row.occurrence_dates };
  };
  const eventCard = (row, over = {}) => ({ ...row, kind: "event", id: row.event_id, title: row.short_title || row.event_name, name: row.event_name, detailHref: "/florida-events/" + row.slug, ticket: null, ...over });
  const props = (card, extra = {}) => ({ photo: null, visitFacts: card, title: card.title, eyebrow: "Fall", rank: 1, facts: [card.city], take: card.card_hook, href: card.detailHref, external: false, ariaLabel: "Open " + card.title, ...extra });
  const btn = (card, extra) => /wf-place-card-remind/.test(renderToStaticMarkup(h(RailCard, props(card, extra))));
  const fallCard = eventCard({ ...shift(fruitville, 10), start_time: "10:00:00", end_time: "17:00:00" });
  const halloweenCard = eventCard(shift(mangoni, 10));
  ok(btn(fallCard), "a dated Fall card (select nights, real registry row) shows Remind me");
  ok(btn(halloweenCard, { spooky: true }) && btn(halloweenCard), "a dated Halloween card shows Remind me, in the spooky skin and out of it");
  ok(btn(halloweenCard, { className: "wf-fall-card" }) && btn(fallCard, { className: "wf-christmas-card" }), "the button is skin independent (fall and Christmas root classes)");
  const xmasRow = mergeChristmasResearch([]).find((r) => r.event_id === "sunset-walk-holiday-nights-2026" || r.slug === "sunset-walk-holiday-nights-2026");
  const xmasCard = eventCard(shift(xmasRow, 10), { eyebrow: "CHRISTMAS" });
  ok(btn(xmasCard), "a dated Christmas card shows Remind me");
  ok(!btn({ ...xmasCard, season_undated: true, start_date: null, end_date: null, occurrence_dates: null }), "an undated season card shows no Remind me");
  ok(!btn({ ...xmasCard, season_undated: true }), "season_undated alone (dates still on the row) shows no Remind me");
  const old = eventCard({ ...fruitville, start_date: "2026-09-01", end_date: "2026-09-30", occurrence_dates: ["2026-09-05", "2026-09-12"] });
  ok(!btn(old), "a past Fall card shows no Remind me");
  for (const status of ["cancelled", "Canceled", "postponed"]) ok(!btn({ ...fallCard, status }) && !btn({ ...fallCard, event_status: status }), `a ${status} card shows no Remind me (status and event_status)`);
  ok(!btn({ ...fallCard, detailHref: null }, { href: "https://organizer.example/tickets", external: true }), "a card that opens the organizer site (no event page) shows no Remind me");
  ok(!btn({ ...fallCard, detailHref: null }, { href: null }), "a card with no link shows no Remind me");
  const place = renderToStaticMarkup(h(RailCard, { photo: null, title: "A Place", eyebrow: "Food", rank: 1, href: "/p/abc", place: { id: "abc", name: "A Place", types: [], lat: 27, lng: -82 } }));
  ok(!/wf-place-card-remind/.test(place), "a place card (no event row) shows no Remind me");
  const html = renderToStaticMarkup(h(RailCard, props(fallCard)));
  const i = html.indexOf("wf-place-card-remind");
  ok(html.indexOf("wf-place-card-dislike") < i && i < html.indexOf("wf-place-card-share"), "on a Fall card Remind me sits between the reactions and Share");
  // Ticket link: the sheet's Google link carries the card's own on-site ticket route, never a raw partner URL.
  const tick = eventCard(shift(mangoni, 10), { ticket: { href: "/api/commerce/go?provider=undercover_tourist&offer=1&surface=fall_intent_rail&content=x" } });
  const opened = renderToStaticMarkup(h(RemindMe, { facts: reminderFactsFor(tick, { href: tick.detailHref, today: realToday }), variant: "card", ticketHref: tick.ticket.href, now: Date.parse(realToday + "T12:00:00Z"), defaultOpen: true, portal: false }));
  const g = /href="(https:\/\/calendar\.google\.com[^"]+)"/.exec(opened);
  const det = g ? new URL(g[1].replace(/&amp;/g, "&")).searchParams.get("details") : "";
  ok(/Tickets: https:\/\/www\.gowayfind\.com\/api\/commerce\/go\?/.test(det) && !/undercovertourist|sweetfieldsfarm/i.test(det), "the Google Calendar details carry the on-site /api/commerce/go ticket route, not a raw partner URL");
}

// ── wiring, static ─────────────────────────────────────────────────────────
{
  const rails = strip(read("app/components/ChristmasIntentRails.js")), browse = strip(read("app/components/ChristmasBrowse.js")), card = strip(read("app/components/RailCard.js"));
  ok(!/\bremind=|remindTicketHref=/.test(rails + browse), "the Christmas rails and browse pass no reminder props: RailCard derives the button for every event card itself");
  ok(/reminderFactsFor\(\{ name: title, \.\.\.visitFacts \}, \{ href: cardHref \|\| null \}\)/.test(card) && /visitFacts \? reminderFactsFor/.test(card), "RailCard derives reminder facts from the event row (visitFacts) and the card's own link");
  ok(/\{remind \? <RemindMe facts=\{remind\} variant="card" ticketHref=\{remindTicketHref\} surface="rail_card" \/> : null\}/.test(card), "RailCard renders the button only when facts exist");
  // Census: every file that hands RailCard an event row. A new event card surface must be added here on purpose.
  const consumers = [];
  const walk = (dir) => { for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) { const rel = dir + "/" + e.name; if (e.isDirectory()) walk(rel); else if (/\.js$/.test(e.name) && /\bvisitFacts=\{/.test(read(rel))) consumers.push(rel); } };
  walk("app");
  ok(consumers.sort().join() === ["app/components/ChristmasBrowse.js", "app/components/ChristmasIntentRails.js", "app/components/FallIntentRails.js", "app/components/PosterEventCard.js", "app/components/screens/Events.js", "app/home.js"].join(), `every RailCard event surface is accounted for (${consumers.join(", ")})`);
  const i = card.indexOf("<RemindMe"), disl = card.indexOf('className={"wf-place-card-dislike"'), share = card.indexOf('className="wf-place-card-share"');
  ok(disl > 0 && i > disl && i < share, "RailCard puts the button between the reactions and Share");
  const page = strip(read("app/florida-events/[slug]/page.js"));
  const sv = page.indexOf("<SaveEventButton"), rm = page.indexOf('<RemindMe facts={remind} variant="page"'), sh = page.indexOf("<ShareButton");
  ok(sv > 0 && rm > sv && rm < sh, "the event page puts Remind me between Save and Share");
  ok(/const remind = reminderFactsFor\(e, \{ occurrences: occurrenceDatesFor\(e\) \}\);/.test(page), "the event page builds facts from the same row it renders, with the nights from lib/eventOccurrences.js (occurrenceDatesFor)");
  const css = read("app/components/css.js");
  ok(/\.wf-sheet-card-actions:has\(\.wf-place-card-remind\)/.test(css), "the action row grid has room for the fifth control");
  const comp = strip(read("app/components/RemindMe.js"));
  ok(/width: 44, height: 44/.test(comp) && (comp.match(/minHeight: 48/g) || []).length >= 3 && /minHeight: 44/.test(comp), "tap targets are at least 44px (close 44, choices and button 48)");
  ok(/key === "Escape"/.test(comp) && /e\.key !== "Tab"/.test(comp) && /aria-modal="true"/.test(comp) && /STOP/.test(comp), "Escape closes, Tab is trapped, the dialog is modal, and taps do not reach the card");
  ok(/data-remind-backdrop \{\.\.\.STOP\} onClick=\{\(e\) => \{ e\.stopPropagation\(\); if \(e\.target === e\.currentTarget\) onClose\(\); \}\}/.test(comp), "the backdrop closes the sheet on an outside tap (its onClick comes after the propagation guard, which would otherwise replace it)");
  ok(/track\("reminder_open"/.test(comp) && /track\("reminder_set", \{ slug: facts\.slug, preset: result\.preset, days_before: result\.daysBefore/.test(comp), "analytics: reminder_open and reminder_set (preset, days_before, slug) through the existing track helper");
  ok(!/<script|createElement\("script"|googletagmanager|connect\.facebook/.test(comp), "no new third party script");
  // Honest copy (owner, 2026-10-14): the phone asks before it saves, so the page never claims it did.
  const mod = await loadComponent(path.join(ROOT, "app/components/RemindMe.js"), ROOT);
  ok(mod.ADD_BUTTON_LABEL === "Add to my calendar" && mod.ADD_HELP === "Your calendar will ask you to add it. Tap Add to save the reminder.", "the sheet action is 'Add to my calendar' and the after-tap line is the agreed honest sentence");
  const words = [...comp.matchAll(/"([^"\n]{3,})"|>([^<>{}\n]{3,})</g)].map((m) => m[1] || m[2]).join(" | ");
  ok(!/\bsaved\b|reminder set|\bis set\b|added to your calendar/i.test(words + " " + mod.ADD_HELP), "no copy anywhere says 'saved', 'reminder set' or that it is already in the calendar");
  ok(/Use Google Calendar instead/.test(comp) && /GOOGLE_ALERT_NOTE/.test(comp), "the Google link keeps its label and the default alert note");
  ok(/if \(starting\) \{ e\.preventDefault\(\); return; \}/.test(comp) && /setTimeout\(\(\) => setStarting\(false\), ADD_DEBOUNCE_MS\)/.test(comp) && /aria-disabled=\{starting \? "true" : undefined\}/.test(comp) && mod.ADD_DEBOUNCE_MS >= 1500, "a second tap while the download starts is ignored (preventDefault) and the button reads as disabled");
  ok(!/[–—]/.test(words + mod.ADD_HELP), "no dashes in any string the sheet shows");
}

if (fail) { console.log(`test-event-reminder-render: FAIL (${fail} failed, ${pass} passed)`); process.exit(1); }
console.log(`test-event-reminder-render: OK (${pass} assertions: hidden for undated, watchlist and past; present for dated; sheet choices; ${railChecked} real rail cards and ${browseChecked} browse cards)`);
