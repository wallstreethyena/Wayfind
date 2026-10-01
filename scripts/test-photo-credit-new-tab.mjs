#!/usr/bin/env node
/**
 * test-photo-credit-new-tab — every EXTERNAL photo-attribution link opens in a
 * new tab (issue #1601) and attribution stays exact.
 *
 * Why: a credit link used to replace the reader's Wayfind page (and scroll
 * position) with a Wikimedia / Unsplash / Google Maps page. The fix is ONE
 * server-safe anchor, app/components/PhotoCreditLink.js, used at every site.
 *
 * Everything below RENDERS the real components (scripts/lib/jsxLoad.mjs +
 * react-dom/server) and asserts on the rendered anchors:
 *   1. PhotoCreditLink: target=_blank, rel has noopener, existing rel tokens
 *      kept, NO noreferrer added, href + visible text exact, sr-only hint.
 *   2. GuideFigureCredit (credit, licence, "Google Maps") with a fixture.
 *   3. The real /guides hub (GuidesHub) credit lines, hrefs compared with the
 *      real guideHero() data, plus its card/nav links as NEGATIVE controls.
 *   4. IconicPlaceCard + RailCard credit badge: new tab, aria-label announces
 *      it, href exact.
 *   5. NESTED CARD: the card's REAL onClick is captured from the render and
 *      invoked with an event whose target sits inside the credit <a>: the
 *      open callback must NOT fire. Body tap = positive control (must fire).
 *   6. /go/florida PhotoCredit and /florida-events/[slug] credit are pages
 *      that cannot be rendered under plain node (supabase / next/cache), so
 *      this is the WEAKER source-level check: the credit line must go through
 *      <PhotoCreditLink> with the same href expression, and no raw <a> remains.
 *   7. Census: every file under app/ that renders a credit/licence/photo
 *      attribution anchor is in the known list (a new one fails until listed).
 *
 * Red-prove (manual, python mutations): see the lane report / commit message.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const load = async (rel) => { const m = await loadComponent(path.join(ROOT, rel), ROOT); return m.default || m; };
const loadNamed = async (rel) => loadComponent(path.join(ROOT, rel), ROOT);

const anchors = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => {
  const attrs = m[1];
  const get = (n) => { const r = new RegExp(`\\s${n}="([^"]*)"`).exec(" " + attrs); return r ? r[1].replace(/&amp;/g, "&") : null; };
  const visible = m[2].replace(/<span[^>]*>\s*\(opens in a new tab\)<\/span>/g, "").replace(/<[^>]+>/g, "");
  return { attrs, href: get("href"), target: get("target"), rel: get("rel"), aria: get("aria-label"), visible, inner: m[2] };
});
const relTokens = (a) => String(a.rel || "").split(/\s+/).filter(Boolean);
const newTab = (a, label, { keepRel } = {}) => {
  ok(a.target === "_blank", `${label}: target="_blank" (got ${a.target})`);
  ok(relTokens(a).includes("noopener"), `${label}: rel contains noopener (got ${a.rel})`);
  if (keepRel) ok(a.rel === keepRel, `${label}: rel unchanged from before (${keepRel}; got ${a.rel})`);
  else ok(!relTokens(a).includes("noreferrer"), `${label}: noreferrer was NOT introduced (got ${a.rel})`);
};
const announces = (a, label) => ok(/new tab/.test(a.inner) || /new tab/.test(a.aria || ""), `${label}: screen-reader hint "opens in a new tab" present`);

// ── 1. the shared anchor ────────────────────────────────────────────────────
{
  const PCL = await load("app/components/PhotoCreditLink.js");
  const [a] = anchors(renderToStaticMarkup(React.createElement(PCL, { href: "https://commons.wikimedia.org/wiki/File:X.jpg?a=1&b=2" }, "Photo: Jane Doe")));
  ok(a && a.href === "https://commons.wikimedia.org/wiki/File:X.jpg?a=1&b=2" && a.visible === "Photo: Jane Doe", "PhotoCreditLink: href and visible text exact");
  newTab(a, "PhotoCreditLink"); announces(a, "PhotoCreditLink");
  const [b] = anchors(renderToStaticMarkup(React.createElement(PCL, { href: "https://e.example/c", rel: "nofollow license" }, "Jane")));
  ok(relTokens(b).includes("nofollow") && relTokens(b).includes("license") && relTokens(b).includes("noopener"), `PhotoCreditLink: existing rel tokens kept + noopener (got ${b.rel})`);
  const [c] = anchors(renderToStaticMarkup(React.createElement(PCL, { href: "https://e.example/c", rel: "noopener noreferrer" }, "Jane")));
  ok(c.rel === "noopener noreferrer", `PhotoCreditLink: a pre-existing noreferrer is kept and noopener not duplicated (got ${c.rel})`);
}

// ── 2. GuideFigureCredit ────────────────────────────────────────────────────
{
  const GF = await loadNamed("app/components/GuideFigure.js");
  const CREDIT = "https://commons.wikimedia.org/wiki/File:Fixture.jpg";
  const LIC = "https://creativecommons.org/licenses/by-sa/4.0/";
  const MAPS = "https://maps.google.com/?cid=123";
  const html = renderToStaticMarkup(React.createElement("div", null,
    React.createElement(GF.GuideFigureCredit, { image: { src: "/x.jpg", alt: "x", credit: "Jane Doe", creditHref: CREDIT, license: "CC BY-SA 4.0", licenseUrl: LIC, providerHref: MAPS } }),
    React.createElement("a", { href: "/api/eats/go?q=x", className: "book" }, "Book a table")));
  const as = anchors(html);
  const by = (h) => as.find((a) => a.href === h);
  const cr = by(CREDIT), li = by(LIC), mp = by(MAPS), bk = by("/api/eats/go?q=x");
  ok(cr && cr.visible === "Photo: Jane Doe", "GuideFigureCredit: credit anchor href + visible text exact");
  ok(li && li.visible === "CC BY-SA 4.0", "GuideFigureCredit: licence anchor href + visible text exact");
  ok(mp && mp.visible === "Google Maps", "GuideFigureCredit: provider anchor href + visible text exact");
  for (const [a, l] of [[cr, "GuideFigureCredit credit"], [li, "GuideFigureCredit licence"], [mp, "GuideFigureCredit Google Maps"]]) if (a) { newTab(a, l); announces(a, l); }
  ok(bk && bk.target === null && !bk.rel, "NEGATIVE CONTROL: the booking link beside the credit is NOT target=_blank");
  // fallback chain: no creditHref -> source, no licenseUrl -> source
  const fb = anchors(renderToStaticMarkup(React.createElement(GF.GuideFigureCredit, { image: { src: "/x.jpg", alt: "x", credit: "J", source: "https://src.example/p", license: "CC0" } })));
  ok(fb.length === 2 && fb.every((a) => a.href === "https://src.example/p" && a.target === "_blank"), "GuideFigureCredit: source fallback href unchanged and new tab");
}

// ── 3. the real /guides hub ─────────────────────────────────────────────────
{
  const Hub = await load("app/guides/page.js");
  const { guideHero } = await import(path.join(ROOT, "lib/guideHero.js"));
  const { GUIDES } = await import(path.join(ROOT, "lib/guides.js"));
  const html = renderToStaticMarkup(React.createElement(Hub));
  const credits = [...html.matchAll(/<p class="[^"]*\bcredit\b[^"]*">([\s\S]*?)<\/p>/g)].map((m) => anchors(m[1])).flat();
  ok(credits.length >= 4, `PROBE: /guides hub rendered ${credits.length} credit/licence anchors (need >= 4, else the probe found nothing)`);
  const allowed = new Set();
  for (const slug of Object.keys(GUIDES)) { const art = guideHero(slug); if (!art) continue; if (art.credit) allowed.add(art.source); if (art.license) allowed.add(art.licenseUrl || art.source); }
  credits.forEach((a, i) => { newTab(a, `/guides credit #${i}`); announces(a, `/guides credit #${i}`); ok(allowed.has(a.href), `/guides credit #${i}: href ${a.href} equals guideHero source/licenseUrl`); });
  const nav = anchors(html).filter((a) => /^\/guides\//.test(a.href || ""));
  ok(nav.length >= 4 && nav.every((a) => a.target === null), `NEGATIVE CONTROL: ${nav.length} /guides/* card links stay in-tab`);
}

// ── 4 + 5. card credit badge + nested click ─────────────────────────────────
// A chain-aware model of the DOM: closest(sel) walks target -> ancestors and
// matches simple tag / [role='x'] selectors like the real Element.closest.
const chainEvent = (chain) => {
  const node = (i) => ({
    tagName: chain[i].tag.toUpperCase(),
    closest(sel) {
      for (let j = i; j < chain.length; j++) {
        for (const part of sel.split(",").map((s) => s.trim())) {
          const rm = /^\[role='([^']+)'\]$/.exec(part);
          if (rm ? chain[j].role === rm[1] : chain[j].tag === part) return node(j);
        }
      }
      return null;
    },
  });
  const target = node(0);
  return { target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, currentTarget: null, button: 0 };
};
async function renderCapturing(Comp, props, pick) {
  const orig = React.createElement; let captured = null;
  React.createElement = function (type, p, ...rest) { if (p && pick(type, p) && !captured) captured = p; return orig.call(this, type, p, ...rest); };
  let html; try { html = renderToStaticMarkup(orig(Comp, props)); } finally { React.createElement = orig; }
  return { html, rootProps: captured };
}
const PLACE = { id: "ChIJcredit", name: "Credit Test Beach", rating: 4.6, reviews: 1200, types: ["tourist_attraction"], lat: 27.3, lng: -82.5, photo: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Test.jpg" };
const CRED_HREF = "https://commons.wikimedia.org/wiki/File:Test.jpg";
for (const spec of [
  { name: "IconicPlaceCard", file: "app/components/IconicPlaceCard.js", props: { place: PLACE, rank: 1, href: "/p/ChIJcredit", photoAttr: "Jane Doe / CC BY-SA 4.0", photoAttrHref: CRED_HREF }, pick: (t, p) => t === "li" && "data-card-opens-detail" in p, bodyChain: [{ tag: "div" }, { tag: "li" }], openProp: "onOpen" },
  { name: "RailCard", file: "app/components/RailCard.js", props: { photo: PLACE.photo, title: "Credit Test Beach", href: "/p/ChIJcredit", cta: { label: "See place", href: "/p/ChIJcredit" }, photoAttr: "Jane Doe / CC BY-SA 4.0", photoAttrHref: CRED_HREF }, pick: (t, p) => t === "article" && p.role === "button" && typeof p.onClick === "function" && /wf-rail-card/.test(p.className || ""), bodyChain: [{ tag: "div" }, { tag: "article", role: "button" }], openProp: "onOpen" },
]) {
  const Comp = await load(spec.file);
  let opened = 0;
  const { html, rootProps } = await renderCapturing(Comp, { ...spec.props, [spec.openProp]: () => { opened++; } }, spec.pick);
  const badge = anchors(html).find((a) => /wf-place-card-photo-attr/.test(a.attrs));
  ok(!!badge, `${spec.name}: the credit badge renders as an <a> (PROBE)`);
  if (badge) {
    newTab(badge, `${spec.name} credit`, { keepRel: "noopener noreferrer" }); // already target=_blank + noopener noreferrer before this change; unchanged
    ok(badge.href === CRED_HREF, `${spec.name} credit: href unchanged (got ${badge.href})`);
    ok(badge.visible === "©", `${spec.name} credit: visible text is still © (got ${JSON.stringify(badge.visible)})`);
    ok(/^Photo credit: Jane Doe \/ CC BY-SA 4\.0/.test(badge.aria || ""), `${spec.name} credit: attribution text kept at the start of aria-label (got ${badge.aria})`);
    announces(badge, `${spec.name} credit`);
  }
  ok(anchors(html).some((a) => /^\/p\//.test(a.href || "") && a.target === null), `NEGATIVE CONTROL ${spec.name}: the card's own /p/ link is NOT target=_blank`);
  ok(rootProps && typeof rootProps.onClick === "function", `${spec.name}: captured the card root's REAL onClick (PROBE)`);
  if (rootProps && typeof rootProps.onClick === "function") {
    // the card gates on a pointer-intent hook; give it a clean tap (no drag)
    const down = rootProps.onPointerDown, up = rootProps.onPointerUp;
    const tap = () => { try { down && down({ clientX: 5, clientY: 5, pointerType: "touch", button: 0 }); up && up({ clientX: 5, clientY: 5, pointerType: "touch", button: 0 }); } catch (e) {} };
    // POSITIVE CONTROL first: a tap on the card body opens it.
    opened = 0; tap(); rootProps.onClick(chainEvent(spec.bodyChain));
    ok(opened === 1, `POSITIVE CONTROL ${spec.name}: a body tap calls the open callback (called ${opened}x)`);
    // the credit anchor click: target is the <a>, ancestors are media div + card root.
    opened = 0; tap(); rootProps.onClick(chainEvent([{ tag: "a" }, { tag: "div" }, ...spec.bodyChain.slice(1)]));
    ok(opened === 0, `${spec.name}: a click on the credit <a> must NOT open the card/sheet (opened ${opened}x)`);
  }
}

// ── 6. pages that cannot be rendered under plain node (WEAKER, source-level) ─
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const page = (rel) => strip(readFileSync(path.join(ROOT, rel), "utf8"));
{
  const g = page("app/go/florida/page.js");
  const fn = /function PhotoCredit\(\{ art \}\)\s*\{[\s\S]*?\n\}/.exec(g)?.[0] || "";
  ok(fn.length > 0, "WEAKER (source-level): /go/florida PhotoCredit found");
  ok(/<PhotoCreditLink href=\{art\.source\}>\{art\.credit\}<\/PhotoCreditLink>/.test(fn), "WEAKER: /go/florida credit goes through <PhotoCreditLink href={art.source}>");
  ok(/<PhotoCreditLink href=\{art\.licenseUrl\}>\{art\.license\}<\/PhotoCreditLink>/.test(fn), "WEAKER: /go/florida licence goes through <PhotoCreditLink href={art.licenseUrl}>");
  ok(!/<a[\s>]/.test(fn), "WEAKER: /go/florida PhotoCredit has no raw <a>");
  ok(/import PhotoCreditLink from "\.\.\/\.\.\/components\/PhotoCreditLink"/.test(g), "WEAKER: /go/florida imports PhotoCreditLink");
  const e = page("app/florida-events/[slug]/page.js");
  ok(/<PhotoCreditLink style=\{S\.link\} href=\{shots\.creditUrl\} rel="nofollow noopener">\{shots\.credit\}<\/PhotoCreditLink>/.test(e), "WEAKER: /florida-events credit goes through <PhotoCreditLink> with href={shots.creditUrl} and rel nofollow kept");
  ok(!/<a[^>]*shots\.creditUrl/.test(e), "WEAKER: /florida-events has no raw <a> on shots.creditUrl");
  ok(/import PhotoCreditLink from "\.\.\/\.\.\/components\/PhotoCreditLink\.?j?s?"/.test(e), "WEAKER: /florida-events imports PhotoCreditLink");
}

// ── 7. census: any raw external credit anchor in app/ fails until reviewed ──
{
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { if (n === "node_modules" || n.startsWith(".")) continue; const p = path.join(d, n); const s = statSync(p); if (s.isDirectory()) walk(p); else if (/\.js$/.test(n)) files.push(p); } };
  walk(path.join(ROOT, "app"));
  // A raw <a ... href={...credit|licen[sc]e|photoAttr|attribution...}> that is
  // not PhotoCreditLink. wf-place-card-photo-attr badges already carry
  // target=_blank and are asserted by section 4, so they are matched here too.
  const RAW = /<a\b[^>]*href=\{[^}]*(?:credit|licen[sc]e|photoAttr|attribution|providerHref|photographer)[^}]*\}[^>]*>/i;
  const found = [];
  for (const f of files) {
    const src = strip(readFileSync(f, "utf8"));
    for (const m of src.matchAll(new RegExp(RAW.source, "gi"))) found.push(path.relative(ROOT, f) + ": " + m[0].slice(0, 90));
  }
  const KNOWN = [/RailCard\.js: <a/, /IconicPlaceCard\.js: <a/];
  const unknown = found.filter((x) => !KNOWN.some((k) => k.test(x)));
  ok(unknown.length === 0, `census: raw (non-PhotoCreditLink) photo-attribution anchors found: ${unknown.join(" | ")}`);
  ok(found.length >= 2, `PROBE: census regex saw the two known card badges (found ${found.length})`);
}

if (fail.length) { console.error(`FAIL test-photo-credit-new-tab: ${fail.length} failed, ${pass} passed`); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`OK test-photo-credit-new-tab: ${pass} assertions (rendered: PhotoCreditLink, GuideFigureCredit, /guides hub, IconicPlaceCard, RailCard; source-level: /go/florida, /florida-events)`);
