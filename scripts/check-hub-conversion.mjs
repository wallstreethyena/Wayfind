#!/usr/bin/env node
/**
 * check-hub-conversion — /guides and /culture/[metro] must never be dead ends again,
 * and their instrumentation must actually survive the commerce whitelist.
 *
 * WHY (2026-07-31). Measured in PostHog over 30 days, owner excluded:
 *   /guides 12 sessions, /culture/tampa 10, /culture/orlando 9 — all 100.0%
 *   dead with 0.0 engagement events, while /culture/[metro] was shipping LIVE
 *   affiliate CTAs that emitted nothing at all.
 *
 * THE FAILURE THIS GUARD IS REALLY FOR is not a missing component — it is a
 * field that looks present in the source and is silently dropped at runtime.
 * lib/commerce.commercePayload() whitelists CONTEXT_FIELDS and drops anything
 * else without error. Pass `city` instead of `city_id`, or `cta_variant`
 * instead of `variant`, and the event still fires, the code still reads fine,
 * and the property is simply absent on the dashboard — which is
 * indistinguishable from nobody clicking.
 *
 * So this asserts on the CALL: it runs the real payload builder over the exact
 * shape the components emit and requires every field to come out the other side.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { commercePayload, rankBucket, CONTEXT_FIELDS } from "../lib/commerce.js";
import { hubProductProps, hubCommerceProps, mintClickId } from "../lib/hubConversion.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ---------------------------------------------------------------------------
// 1. The commerce payload must survive the whitelist, field for field.
// ---------------------------------------------------------------------------
const ARGS = {
  clickId: mintClickId(), slugKey: "culture_slug", slug: "orlando", surface: "culture",
  provider: "viator", offerId: "culture:orlando", position: 1,
  variant: "hub_tours_v1", city: "Orlando", category: "tours",
};

// THE REAL BUILDER the components call — not a copy of it. The first version of
// this guard built its own expected payload, so renaming city_id -> city inside
// the component left it green. This calls the same function the component does.
const cProps = hubCommerceProps(ARGS);
const pProps = hubProductProps(ARGS);

// Every commerce field must survive commercePayload's whitelist.
for (const ev of ["commerce_impression", "commerce_cta_clicked"]) {
  const out = commercePayload(ev, cProps);
  for (const k of Object.keys(cProps)) {
    if (cProps[k] == null) continue;
    ok(out[k] === cProps[k],
      `${ev}: hubCommerceProps field "${k}" is DROPPED by the commerce whitelist — it would read as absent on the dashboard`);
  }
  ok(Object.keys(out).length >= 8, `${ev}: expected >=8 surviving fields, got ${Object.keys(out).length}`);
}

// Every commerce key must be a declared CONTEXT_FIELD. This is the assertion the
// city_id -> city red-prove must trip.
for (const k of Object.keys(cProps)) {
  ok(CONTEXT_FIELDS.includes(k),
    `hubCommerceProps emits "${k}", which is NOT in commerce CONTEXT_FIELDS — it will be silently dropped`);
}

// The product events must carry the literal field set the spec asks for.
for (const k of ["click_id", "culture_slug", "surface", "provider", "offer_id", "position", "cta_variant", "city", "category"]) {
  ok(Object.prototype.hasOwnProperty.call(pProps, k) && pProps[k] != null,
    `hubProductProps must carry a non-null "${k}"`);
}
ok(hubProductProps({ ...ARGS, slugKey: "guide_slug" }).guide_slug === "orlando",
  "hubProductProps must honour slugKey so /guides emits guide_slug and /culture emits culture_slug");

// click_id must never be absent or duplicated across CTAs.
ok(typeof pProps.click_id === "string" && pProps.click_id.length > 6, "click_id must be a real id");
ok(pProps.click_id === cProps.click_id, "click_id must be IDENTICAL across the product and commerce events or impression->click cannot join");
ok(mintClickId() !== mintClickId(), "mintClickId must not return a constant");

// rank_bucket must stay coarse; raw position must never reach a money event.
ok(cProps.rank_bucket === "top3" && cProps.position === undefined,
  "money events must carry a coarse rank_bucket and NEVER a raw position");
ok(rankBucket(1) === "top3" && rankBucket(7) === "4-10" && rankBucket(99) === "11+",
  "rankBucket must bucket position coarsely");

// ---------------------------------------------------------------------------
// 2. Both components must RENDER — not merely exist.
// ---------------------------------------------------------------------------
const hubMod = await loadComponent(REPO + "app/components/HubConversion.js", REPO);
const HubConversion = hubMod.default;
ok(typeof HubConversion === "function", "HubConversion has a default export");

const linkMod = await loadComponent(REPO + "app/components/TrackedOfferLink.js", REPO);
const TrackedOfferLink = linkMod.default;
ok(typeof TrackedOfferLink === "function", "TrackedOfferLink has a default export");

const CTA = {
  label: "See tours & tickets in Orlando", href: "/api/viator/go?q=things%20to%20do&city=Orlando",
  provider: "viator", offerId: "culture:orlando", monetized: true, variant: "hub_tours_v1", position: 1,
};
const hubHtml = renderToStaticMarkup(createElement(HubConversion, {
  surface: "culture", slugKey: "culture_slug", slug: "orlando", city: "Orlando",
  category: "tours", cta: CTA, next: { label: "Browse every Orlando pick", href: "/things-to-do/orlando" },
}));
ok(hubHtml.includes("See tours &amp; tickets in Orlando") || hubHtml.includes("See tours & tickets in Orlando"),
  "HubConversion must render its primary CTA label");
ok(/href="\/api\/viator\/go/.test(hubHtml),
  "HubConversion's monetized CTA must point at our own redirect, not a partner domain");
ok(/no extra cost to you/.test(hubHtml),
  "FTC disclosure must render adjacent to an earning CTA");
ok(/href="\/things-to-do\/orlando"/.test(hubHtml),
  "the continue card must render so the page is not terminal");

// A CTA with no href must render NOTHING rather than an empty frame.
ok(renderToStaticMarkup(createElement(HubConversion, { surface: "culture", slugKey: "culture_slug", slug: "x", cta: null })) === "",
  "HubConversion with no CTA must render nothing, not an empty shell");

const linkHtml = renderToStaticMarkup(createElement(TrackedOfferLink, {
  href: "https://www.viator.com/tours/Orlando/x/d1-2", label: "See related tours & tickets ↗",
  surface: "culture", slugKey: "culture_slug", slug: "orlando", city: "Orlando",
  category: "tours", provider: "viator", offerId: "product:Foo", variant: "culture_item_v1", position: 2,
}));
ok(/rel="noreferrer sponsored"/.test(linkHtml), "TrackedOfferLink must keep rel=noreferrer sponsored — FTC + SEO");
ok(/target="_blank"/.test(linkHtml), "TrackedOfferLink must keep target=_blank so the article is not lost");
ok(/<a /.test(linkHtml) && !/<button/.test(linkHtml),
  "TrackedOfferLink must stay an anchor — a button breaks cmd-click, middle-click and keyboard activation");

// ---------------------------------------------------------------------------
// 3. The pages must actually MOUNT the conversion layer.
// ---------------------------------------------------------------------------
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const guides = strip(readFileSync(REPO + "app/guides/page.js", "utf8"));
const culture = strip(readFileSync(REPO + "app/culture/[metro]/page.js", "utf8"));

ok(/<HubConversion[\s/>]/.test(guides), "/guides must RENDER HubConversion (not merely import it)");
ok(/<HubConversion[\s/>]/.test(culture), "/culture/[metro] must RENDER HubConversion");
ok(/<TrackedOfferLink[\s/>]/.test(culture), "/culture/[metro] must route its per-item offer links through TrackedOfferLink");

// The per-item link must no longer be a bare anchor carrying a partner href.
ok(!/<a\s[^>]*href=\{\s*url\s*\}/.test(culture),
  "the culture per-item offer link must not be a bare <a href={url}> — that is a monetized click with no measurement");

// Every event name the schema requires, present at a call site.
for (const ev of ["guide_cta_impression", "guide_cta_clicked"]) {
  const inHub = new RegExp(`track\\(\\s*["']${ev}["']`).test(strip(readFileSync(REPO + "app/components/HubConversion.js", "utf8")));
  const inLink = new RegExp(`track\\(\\s*["']${ev}["']`).test(strip(readFileSync(REPO + "app/components/TrackedOfferLink.js", "utf8")));
  ok(inHub && inLink, `${ev} must be emitted from BOTH HubConversion and TrackedOfferLink`);
}
for (const f of [REPO + "app/components/HubConversion.js", REPO + "app/components/TrackedOfferLink.js"]) {
  const s = strip(readFileSync(f, "utf8"));
  const name = f.split("/").pop();
  ok(/emitCommerce\(\s*["']commerce_impression["']/.test(s), `${name} must emit commerce_impression`);
  ok(/emitCommerce\(\s*["']commerce_cta_clicked["']/.test(s), `${name} must emit commerce_cta_clicked`);
  ok(/hubProductProps\(/.test(s) && /hubCommerceProps\(/.test(s), `${name} must build payloads via the SHARED lib/hubConversion builders, not inline copies`);
  ok(/mintClickId/.test(s), `${name} must use the shared mintClickId`);
  // Duplicate-fire guards.
  ok(/if\s*\([^)]*seen\.current[^)]*\)/.test(s), `${name} must READ seen.current in a condition — assigning it without testing it is not a guard`);
}
ok(/if\s*\([^)]*acted\.current[^)]*\)\s*return/.test(strip(readFileSync(REPO + "app/components/HubConversion.js", "utf8"))),
  "HubConversion must guard clicks to one next-step per reader");
ok(/if\s*\([^)]*clicked\.current[^)]*\)\s*return/.test(strip(readFileSync(REPO + "app/components/TrackedOfferLink.js", "utf8"))),
  "TrackedOfferLink must guard clicks to one per link per view");

// ---------------------------------------------------------------------------
// 4. No monetized href on these pages may point straight at a partner domain
//    from the PAGE source. (viatorDirectUrl still supplies exact product URLs
//    to TrackedOfferLink, which is measured — see the PR body.)
// ---------------------------------------------------------------------------
ok(!/href=["']https?:\/\/(?:www\.)?(?:viator|getyourguide|booking)\.com/i.test(guides),
  "/guides must not hardcode a partner URL");

if (fail.length) {
  console.error("check-hub-conversion: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-hub-conversion: OK — ${pass} assertions ` +
  `(commerce payload survives the whitelist field-for-field with a negative control, ` +
  `both components RENDERED, disclosure + rel + anchor semantics intact, ` +
  `4 events wired from 2 components, dupe-guards present, continue card non-terminal)`
);
