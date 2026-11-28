#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guidePrimaryCta } from "../lib/guideCta.js";
import { currentGuides, isGuidePast, isGuideWithheld } from "../lib/guideLifecycle.js";
import { DEDICATED_GUIDE_ROUTES, STANDALONE_GUIDE_INDEX } from "../lib/guideDedicatedRoutes.js";
import { guidePickAwaitingPhoto } from "../lib/guidePhotoGate.js";
import { dedicatedGuideAction, guideDayAction, guideEventOfferEnded, GUIDE_ACTION_PICK_ANCHOR, scopedGuideBodyCta, visibleQuickChoices } from "../lib/guideActionPlan.js";
import { guideQuickChoices } from "../lib/guideSeo.js";

let checks = 0;
const ok = (value, summary) => { assert.ok(value, summary); checks++; };
const day = "2026-11-25";
const active = currentGuides(GUIDES, day);
function input(slug, extra = {}) {
  const guide = GUIDES[slug];
  const shippingPicks = guide?.picks.map((pick, index) => ({ pick, index })).filter(({ pick }) => !guidePickAwaitingPhoto(slug, pick, guide));
  return { slug, guide, shippingPicks, primary: guidePrimaryCta(guide, day), today: day, ...extra };
}
const src = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
for (const [slug, guide] of Object.entries(GUIDES)) {
  const options = input(slug);
  const chosen = DEDICATED_GUIDE_ROUTES.has(slug) ? dedicatedGuideAction(slug, day) : guideDayAction(options);
  if (!active[slug]) {
    ok(!chosen && (isGuidePast(guide, day) || isGuideWithheld(slug, guide)), `${slug}: inactive or photo-held serves no new conversion action`);
    continue;
  }
  ok(chosen?.label && chosen?.href, `${slug}: a live canonical guide cannot omit its action`);
  ok(chosen.href !== "/" && !/intent=search|searchResults/.test(chosen.href), `${slug}: action is not homepage or search-as-book`);
  if (chosen.href === GUIDE_ACTION_PICK_ANCHOR) ok(options.shippingPicks.length, `${slug}: comparison point has real visible picks`);
  const choices = visibleQuickChoices(guideQuickChoices(slug), options.shippingPicks);
  for (const choice of choices) {
    ok(options.shippingPicks[Number(choice.href.slice(6)) - 1]?.pick.name === choice.pickName, `${slug}: Choose Quickly has no orphan or wrong retarget`);
  }
}
for (const {slug, label} of STANDALONE_GUIDE_INDEX) {
  ok(label && !GUIDES[slug] && existsSync(new URL("../app/guides/" + slug + "/page.js", import.meta.url)), "standalone index route exists exactly once");
  ok(dedicatedGuideAction(slug, day)?.href === "/florida-events", "past seasonal guide points to current inventory, never past enrollment");
}
const bio = input("bioluminescence-kayak-tour-space-coast");
ok(guideDayAction(bio)?.href === bio.primary.href && guideDayAction(bio)?.label.includes("Haulover Canal"), "promotes the exact original tracked Merritt Island offer");
ok(guideDayAction({...bio, primary:{ ...bio.primary, place:"Different coast" }})?.kind === "plan", "wrong place cannot promote");
ok(guideDayAction({...bio, primary:{ ...bio.primary, href:"/api/viator/go?intent=search&q=all+tours" }})?.kind === "plan", "search cannot masquerade as booking");
ok(guideDayAction({...bio, shippingPicks:bio.shippingPicks.slice(1,2)})?.kind !== "deal", "the exact advertised pick must ship");
const sea = input("seaworld-orlando-christmas-celebration-2026");
ok(guideDayAction(sea)?.label === "SeaWorld park admission", "the existing day pass is not mislabeled a separately-ticketed party");
ok(guideDayAction({...sea, noSale:{kind:"sold_out"}})?.kind === "plan", "sold-out check removes both money placements");
ok(guideDayAction({...sea, today:"2027-01-04"})?.label === "SeaWorld park admission", "permit the named admission product on the last operator-listed day");
ok(!isGuidePast(sea.guide, "2027-01-05") && guideDayAction({...sea, today:"2027-01-05"})?.kind === "plan" &&
  guideEventOfferEnded(sea.slug, sea.guide.eventTicket, "2027-01-05"), "the SeaWorld sale ends with its operator-listed season without archiving the article early");
ok(guideDayAction({...sea, today:"2027-01-07"}) === null, "expired seasonal edition stays dormant");
const drum = guideDayAction(input("siesta-key-drum-circle"));
ok(drum?.kind === "directions" && drum.href.includes("948%20Beach%20Road"), "drum circle sends a direct named beach address action");
ok(guideDayAction(input("sarasota-half-price-dining"))?.kind !== "deal", "generic metro Clipp inventory is not promoted as a specific restaurant offer");
const badFooter = { kind: "directions", place: "Columbia Restaurant", href: "https://www.google.com/maps/search/?api=1&query=Tampa" };
const armands = "st-armands-circle-restaurants";
const cuban = "best-cuban-sandwich-tampa";
ok(scopedGuideBodyCta(badFooter, input(armands).shippingPicks, armands)?.href.includes("ChIJaTQEjpFqw4gRnHJU2Klfw0o"), "St. Armands directions pin the exact Sarasota Columbia branch");
ok(scopedGuideBodyCta(badFooter, input(cuban).shippingPicks, cuban)?.href.includes("ChIJz8e7TVLEwogRBeybvscHnD4"), "Tampa article directions retain the exact Tampa Columbia branch");
ok(!scopedGuideBodyCta(badFooter, input("best-restaurants-disney-springs").shippingPicks, "best-restaurants-disney-springs"), "an unrelated restaurant footer destination fails closed");

const generic = src("app/guides/[slug]/page.js"), standard = src("app/components/GuideStandardShell.js"), hero = src("app/components/EventDetailShell.js"), frame = src("app/components/EditorialStandard.js");
const index = src("app/guides/page.js"), sitemap = src("app/sitemap.js");
ok(generic.includes("primaryAction={dayAction ? <GuideDayAction") && standard.includes("primaryAction={action ? <GuideDayAction") &&
  frame.includes("quickAction={(primaryAction || quickChoices) ? <>{primaryAction}{quickChoices}</> : null}") && hero.indexOf("{quickAction ?") > hero.indexOf("<h1") && hero.indexOf("{quickAction ?") < hero.indexOf("{story ?"), "mounted before the longer intro in both production frames");
ok(generic.includes("past || guideEventOfferEnded(params.slug, g.eventTicket) || unavailableFor(g.eventTicket)"), "the body cannot revive the expired holiday ticket either");
ok(generic.includes('id="guide-plan-options"') && generic.includes("primaryPromoted={dayAction?.promoted"), "real anchor required and same money anchor not repeated at the footer");
ok(index.includes('href="https://blog.gowayfind.com/">Read the Wayfind Blog'), "main guide index has one crawlable editorial path to the blog");
ok(index.includes("regions = guideRegions(currentGuides(GUIDES))") && index.includes("STANDALONE_GUIDE_INDEX.filter") && sitemap.includes("Object.keys(currentGuides(GUIDES))") && sitemap.includes("STANDALONE_GUIDE_INDEX.filter"), "sitemap and index preserve both current and standalone route rules");
ok(src("app/components/GuideDayAction.js").includes('window.addEventListener("scroll"') &&
  src("app/components/GuideDayAction.js").includes('article.getBoundingClientRect().bottom > window.innerHeight + 72') &&
  src("app/components/GuideDayAction.module.css").includes("env(safe-area-inset-bottom"), "sticky is restricted to the reading interval and respects bottom safe area");
const component = src("app/components/GuideDayAction.js");
ok(component.includes('if (action?.href && hydratedId && typeof IntersectionObserver !== "undefined")') &&
  component.includes('track("guide_cta_impression", { slug, region, cta_kind: action.kind, exact: !!action.exact, monetized: !!action.monetized, placement })') &&
  component.includes('if (action.monetized) { try { emitCommerce("commerce_impression",'), "all visible actions receive product impressions; only monetary actions enter commerce");
ok(component.includes('track("guide_cta_clicked"') && component.includes('if (action.monetized) { try { emitCommerce("commerce_cta_clicked",') &&
  component.includes("entry.intersectionRatio >= .5") && component.includes("impressed.current = true"), "both placements have one viewability-gated impression per action and distinct click taxonomy");
ok(component.includes('data-commerce-owner={action.monetized ? "GuideDayAction" : undefined}'),
  "both placements claim beacon ownership only for monetary actions, preventing a second PostHog event");
ok(component.includes('anchor.getAttribute("data-wf-click-id")') &&
  component.includes('anchor.setAttribute("href", withClickId(href, activationId))') &&
  component.includes('commerceProps(placement, activationId)'),
  "the beacon capture, product click and exact server redirect share a single per-activation id");
const newCount = Object.keys(active).length + STANDALONE_GUIDE_INDEX.length;
console.log(`test-guide-day-action: OK — ${checks} assertions; ${newCount} public guide actions at audit date`);
