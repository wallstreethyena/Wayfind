#!/usr/bin/env node
/**
 * check-citypass — the CityPASS destination allowlist is ENUMERATED, every
 * shipped market carries browser evidence, and no link leaves untracked.
 *
 * THE ONE THIS FILE EXISTS FOR: four of CityPASS's seventeen destinations are not
 * bare city slugs (chicago-comparison, new-york-comparison,
 * san-francisco-comparison, seattle-comparison). A `/${citySlug}` template emits
 * /chicago, /new-york, /san-francisco, /seattle — none of which is a real page.
 * It would not fail locally either, because the two cities we ship (orlando,
 * tampa) are both plain slugs. So the allowlist must be a TABLE, and this guard
 * asserts the four irregular paths are present verbatim.
 */
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const CP = await import(path.resolve("lib/cityPassOffers.js"));
const { COUPONS } = await import(path.resolve("lib/coupons.js"));
const D = await import(path.resolve("lib/dealSheet.js"));

/* ── 1. the allowlist is enumerated, and carries the irregular paths ─────── */
ok(CP.CITYPASS_PATHS.length === 17, `the allowlist has all 17 destinations (got ${CP.CITYPASS_PATHS.length})`);
for (const p of ["/chicago-comparison", "/new-york-comparison", "/san-francisco-comparison", "/seattle-comparison"]) {
  ok(CP.CITYPASS_PATHS.includes(p), `${p} is listed VERBATIM — a bare-slug template would emit ${p.replace("-comparison", "")} and 404`);
  ok(!CP.isCityPassDest("https://www.citypass.com" + p.replace("-comparison", "")),
    `…and the bare-slug form ${p.replace("-comparison", "")} is REFUSED, which is what makes the table load-bearing`);
}

/* ── 2. the destination gate ─────────────────────────────────────────────── */
ok(CP.isCityPassDest("https://www.citypass.com/orlando"), "a listed destination passes");
ok(!CP.isCityPassDest("https://www.citypass.com/miami"), "an UNLISTED city is refused — CityPASS does not serve it and a link would 404");
ok(!CP.isCityPassDest("https://citypass.evil.com/orlando"), "a lookalike host is refused");
ok(!CP.isCityPassDest("http://www.citypass.com/orlando"), "plain http is refused");
ok(!CP.isCityPassDest(""), "empty is refused");

/* ── 3. every shipped market has browser evidence and a tracked link ─────── */
ok(CP.CITYPASS_MARKETS.length > 0, `there are markets to check (got ${CP.CITYPASS_MARKETS.length}) — zero would make this vacuous`);
for (const m of CP.CITYPASS_MARKETS) {
  ok(CP.isCityPassDest(m.dest), `${m.offerId}: its destination is on the allowlist`);
  ok(!!(m.verified && m.verified.on && m.verified.title),
    `${m.offerId}: records the real page title and the date a browser loaded it`);
  ok(!!(m.verified && m.verified.priced && m.verified.priceSeen),
    `${m.offerId}: the page had PRICED inventory when verified — a destination that exists but sells nothing is not shippable`);
  ok(new RegExp(m.city, "i").test(m.verified.title),
    `${m.offerId}: the recorded title names the city, which is what tells a future audit "the page broke" from "inventory changed"`);
  const t = CP.cityPassTrackedUrl(m.offerId);
  ok(typeof t === "string" && t.includes("anrdoezrs.net") && /\/links\/\d+\//.test(t),
    `${m.offerId}: the tracked url exists and carries our CJ publisher id`);
  ok(typeof t === "string" && t.endsWith(m.dest),
    `${m.offerId}: the raw-path form ends in the literal destination (never the dead ?url= form)`);
}
ok(CP.cityPassTrackedUrl("citypass-nowhere") === null, "an unknown offer id yields NULL, never a guessed destination");
ok(CP.cityPassTrackedUrl("") === null && CP.cityPassTrackedUrl(null) === null, "an empty offer id yields null");

/* ── 4. the cards derive, and each one is honest about the money ─────────── */
const cards = COUPONS.filter((c) => c.id.startsWith("cpn-citypass-"));
ok(cards.length === CP.CITYPASS_MARKETS.length, `one card per verified market (${cards.length}/${CP.CITYPASS_MARKETS.length})`);
for (const c of cards) {
  ok(/^(?:Orlando|Tampa Bay) CityPASS®$/.test(c.business), `${c.id}: first reference follows the destination + CityPASS® naming rule (got ${c.business})`);
  // 2026-08-02 (audit F5) — this required the literal "anrdoezrs.net" in the
  // card's url, i.e. the CJ link rendered directly into the DOM. That is now
  // the thing we are removing: a live CJ href in crawlable markup is a billable
  // click for any JS-rendering crawler. The INVARIANT is unchanged and is
  // asserted in both directions — the card must never ship a bare citypass.com
  // link, and the tracked destination must still be reachable — but the click
  // now leaves from the server, so the card carries OUR path.
  ok(typeof c.url === "string" && c.url.startsWith("/api/commerce/go?"),
     `${c.id}: the card links to our redirect, not straight at the partner (got ${String(c.url).slice(0, 60)})`);
  ok(!/citypass\.com|anrdoezrs\.net/i.test(String(c.url)),
     `${c.id}: no partner or CJ host appears in the markup at all — neither a bare citypass.com link nor a live CJ href`);
  {
    const q = new URLSearchParams(String(c.url).split("?")[1] || "");
    ok(q.get("provider") === "citypass", `${c.id}: the redirect names the citypass provider`);
    ok(q.get("offer") === c.id.replace(/^cpn-/, ""), `${c.id}: the redirect carries this market's offer id`);
    ok(/^coupon_citypass_/.test(q.get("surface") || ""), `${c.id}: the surface tag survives, so CJ still reports coupon clicks separately from the intent rail's`);
  }
  ok(D.dealNetwork(c) === "CityPASS", `${c.id}: dealNetwork names CityPASS, so the card discloses the commission (got ${D.dealNetwork(c)})`);
  const d = D.dealDisclosure(c);
  ok(d.affiliate === true && /CityPASS/.test(d.italic), `${c.id}: the disclosure names the network`);
  ok(!/\$\d/.test(String(c.title) + String(c.details)),
    `${c.id}: no fixed price in the copy — the bundle price varies by park count and would go stale silently`);
  ok(c.expires === null, `${c.id}: no invented expiry — a standing product with a fake deadline is a false claim`);
  ok(typeof c.image === "string" && c.image.startsWith("/cards/"), `${c.id}: uses OUR committed art, never a partner image`);
  ok(c.image !== "/cards/family-fun.jpg", `${c.id}: is NOT the ferris-wheel illustration the owner rejected`);
}

/* ── 5. the card only reaches the metro it belongs to ────────────────────── */
{
  const orl = cards.find((c) => c.id === "cpn-citypass-orlando");
  const tpa = cards.find((c) => c.id === "cpn-citypass-tampa");
  ok(!!orl && !!tpa, "both shipped cards are present, so the scoping check below is not vacuous");
  ok(D.dealScope(orl).metro === "orlando", `the Orlando card resolves to the orlando metro (got ${JSON.stringify(D.dealScope(orl))})`);
  ok(D.dealScope(tpa).metro === "tampa", `the Tampa card resolves to the tampa metro (got ${JSON.stringify(D.dealScope(tpa))})`);
  ok(D.dealLocalityRank(orl, "orlando") === 0 && D.dealLocalityRank(orl, "sarasota") === 2,
    "the Orlando card ranks first for an Orlando viewer and last for a Sarasota one — never a generic national fallback");
}

if (fail.length) {
  console.error("check-citypass: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-citypass: OK — ${pass} assertions (17-path enumerated allowlist, 4 irregular paths pinned, ${CP.CITYPASS_MARKETS.length} markets with browser evidence, every link CJ-tracked)`);
