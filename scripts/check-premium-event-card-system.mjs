#!/usr/bin/env node
// One card system, one event-plan composition, no global floating CTA.
// Added after the 2026-09-04 screenshots exposed three independent bypasses of
// RailCard: the event grid, the all-tours grid, and the event-detail plan.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
let pass = 0;
const failures = [];
const ok = (condition, message) => condition ? pass++ : failures.push(message);
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  const stat = statSync(path);
  if (stat.isDirectory()) return name === "node_modules" || name === ".next" ? [] : walk(path);
  return /\.(js|jsx)$/.test(name) ? [path] : [];
});

const rail = read("app/components/RailCard.js");
const iconic = read("app/components/IconicPlaceCard.js");
const content = read("lib/contentCardActions.js");
const savedItems = read("lib/savedItems.js");
const events = read("app/components/screens/Events.js");
const viator = read("app/components/ViatorRail.js");
const detail = read("app/events/[city]/[slug]/page.js");
const eventActions = read("app/events/[city]/[slug]/EventActions.js");
const plan = read("app/events/[city]/[slug]/EventPlan.js");
const menu = read("app/components/sheets/Menu.js");

// The canonical row is present on both card renderers and never conditional on
// the legacy read-only flags. This prevents a future special card from quietly
// losing one or more controls.
for (const [name, source] of [["RailCard", rail], ["IconicPlaceCard", iconic]]) {
  for (const control of ["save", "like", "dislike", "share"]) {
    ok(source.includes(`wf-place-card-${control}`), `${name} lost the ${control} control`);
  }
}
ok(!/actionsReadOnly\s*\?\s*null/.test(rail), "RailCard may not hide its universal action row behind actionsReadOnly");
ok(!/cardActionsReadOnly\s*\?\s*null/.test(iconic), "IconicPlaceCard may not hide its universal action row behind cardActionsReadOnly");
ok(/useContentCardActions\(contentSubject\)/.test(rail), "non-place RailCards do not use the isolated content-action store");
ok(/getUser\(\)/.test(content), "signed-in content saves must verify the current Supabase user");
ok(/import\("\.\/savedItems"\)/.test(content) && /saveItem\(userId/.test(content) && /from\("wf_saved_items"\)/.test(savedItems), "signed-in event and experience saves are not persisted to wf_saved_items");
ok(!/likeSignal|persistLike|persistDislike|governed_score/.test(content), "content reactions must not enter place-ranking signals");

// Every event inventory view is now a rail of the shared premium card. The
// Viator CTA remains the attributed commerce link inside that card.
ok(/function EventCard[\s\S]+?<RailCard/.test(events), "the event card bypasses RailCard");
ok(/events-worth-planning[\s\S]+?<EventCard/.test(events), "the plan-ahead shelf bypasses the shared event card");
ok(/data-rail=\{`events-\$\{activeFilter\.key\}`\}/.test(events), "the selected event category is not a place-card rail");
ok(!/gridTemplateColumns:\s*"repeat\(2/.test(events), "the rejected two-column one-off event/tour grid returned");
ok(/<RailCard[\s\S]+?ctaNode=\{<ViatorCommerceLink/.test(viator), "bookable experiences must use RailCard without losing affiliate attribution");
ok(/<RailNav/.test(viator) && /<RailDots/.test(viator), "the Viator rail lost its navigation affordances");

// The event page owns planning actions and exactly three recommendation rails.
ok(/<EventActions event=/.test(detail), "event detail lost its action panel");
for (const label of ["Save event", "Add to itinerary", "Like", "Not for me", "Share this event"]) {
  ok(eventActions.includes(label), `event detail lost ${label}`);
}
ok(/addPlaceToTrips\(/.test(eventActions), "Add to itinerary does not write through the shared trip model");
for (const title of ["Eat nearby", "Keep the night going", "Stay nearby"]) {
  ok(plan.includes(`title: "${title}"`), `event plan lost the ${title} rail`);
}
ok(/const foodRequest = search[\s\S]+const afterRequest = search[\s\S]+const stayRequest = fetchJsonWithDeadline[\s\S]+await foodRequest/.test(plan), "all event-plan inventory requests start before the first await");
ok(/setRails\(EVENT_PLAN_RAILS\.map[\s\S]+places: null/.test(plan) && /Finding nearby picks/.test(plan), "the event-plan section and its loading rails appear immediately");
ok(/publish\("food", food\)[\s\S]+publish\("after", after\)[\s\S]+publish\("stay", stay\)/.test(plan), "each event-plan rail publishes progressively instead of waiting for the slowest source");
ok(/fetchJsonWithDeadline\(`\/api\/places\/search/.test(plan) && /fetchJsonWithDeadline\(`\/api\/hotels/.test(plan), "every event-plan browser request has a deadline");
ok(/const used = new Set\(\)/.test(plan), "event plan must deduplicate choices across all three rails");
ok(/<RailCard/.test(plan) && /<RailNav/.test(plan) && /<RailDots/.test(plan), "event plan recommendations must use the canonical rail composition");

// The global floating CTA is removed by construction, not hidden with CSS.
const openAppFile = join(ROOT, "app/components/OpenAppCTA.js");
ok(!existsSync(openAppFile), "OpenAppCTA.js returned; the rejected floating control is global again");
for (const file of walk(join(ROOT, "app"))) {
  const source = readFileSync(file, "utf8");
  ok(!/OpenAppCTA|wf-open-app-cta/.test(source), `${relative(ROOT, file)} mounts the rejected floating control`);
}

// Lunch animates the actual postcard, and the click gesture owns the audio.
ok(/playLunchCoin\(\); rollLunchPick\(\)/.test(menu), "the question block click lost its coin cue or reveal action");
ok(/@keyframes wfLunchRise/.test(menu) && /className="wf-lunch-result"/.test(menu), "the actual lunch postcard is not the animated element");
ok(!/wfMarioPipe|wf-lunch-mario/.test(menu), "Mario animation returned; only the result card should move");
ok(/wf-lunch-card-actions/.test(menu) && /lunchActions\.toggleSave/.test(menu) && /lunchActions\.toggleLike/.test(menu) && /lunchActions\.toggleDislike/.test(menu) && /shareLunchChallenge\(\)/.test(menu), "the lunch postcard lost one of its four card actions");
ok(/shareLunchChallenge[\s\S]+?shareLink\(/.test(menu), "the lunch challenge action does not open the canonical native-share path");

if (failures.length) {
  console.error("check-premium-event-card-system: FAIL");
  for (const failure of failures) console.error("  ✗ " + failure);
  process.exit(1);
}
console.log(`check-premium-event-card-system: OK — ${pass} assertions`);
