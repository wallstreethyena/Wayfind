// Guardrail: the first screen must never be blank, and the events rail must
// never again wait on a Google Places search to appear.
//
// THE INCIDENT (measured on production 2026-07-21, Pixel 7 / 4x CPU / 1.6Mbps):
// the "Happening near you" rail was gated on `suggested !== null` — a CLIENT-SIDE
// Places search. LCP candidates were:
//     @   300ms  size  4,676   the "open now first…" subtitle
//     @ 6,692ms  size 11,618   the intro modal greeting
//     @12,776ms  size 68,178   a Ticketmaster image (resourceLoadDelay 11,342ms)
// i.e. ~6.4 seconds where nothing meaningful painted. The rail could not help,
// because it was waiting on a network round trip it did not need.
//
// The fix: render the rail's skeleton immediately, swap in events when they
// arrive, and let Places fill in independently. Re-adding the `suggested` gate,
// or dropping the skeleton, restores a blank first screen — so it fails here.
//
// v8 (2026-08-15) — WHAT MOVED, AND WHY THESE ASSERTIONS MOVED WITH IT.
// The promo HERO DECK is gone. It was a client-only carousel of eight cards
// that sat inside this section in three mutually exclusive foryouEvents
// branches, and EventsRailSkeleton existed to reserve its 248px while the
// events chain was in flight. <DaypartRail> replaces it at the top of
// wf-col-main and is SERVER-RENDERED with real ranked places, so the first
// screen no longer waits on anything at all — strictly better than a skeleton,
// and the reason the skeleton assertions below became assertions about the
// rail instead.
//
// EVERYTHING ABOUT THE EVENTS RAIL ITSELF IS UNCHANGED. `eventsRailSlot` —
// section nine of BestNearby, its EV_RAIL_MIN_H reserve, its own loading box,
// the `suggested` prohibition — is untouched, and every assertion about it
// below is the original.
import { readFileSync } from "node:fs";
import { shellSrc } from "./lib/shellSrc.mjs";
import { railArtSize } from "../lib/rails.js";

// v8.2: eventsRailSlot is the last const the feed builds before its return,
// so the return is where its body ends. This used to be "const discoveryMenu
// = (", which was hoisted ABOVE eventsRailSlot when the Shortcuts row moved
// into the header — leaving every slice below it empty and every assertion
// over that slice vacuously true.
// v8.87 — RE-ANCHORED, because the slot MOVED and this delimiter is a file
// position rather than an invariant (CLAUDE.md's own warning about exactly
// this shape). It used to sit inside the `screen === "suggested"` IIFE at ten
// spaces of indent and was closed by that IIFE's `return (`; the events rail
// was dead there — computed and handed to nothing — so it moved out to the
// component body and became a thunk handed to <DaypartRail eventsSlot>.
//
// Both anchors changed with it: `(() => {` -> `() => {`, and the terminator is
// now the thunk's own `\n  };` at component depth. The length PROBE below is
// what made this a two-minute fix instead of four vacuous passes — it is the
// reason a delimiter like this is allowed to exist at all, and it is why the
// probe is an assertion rather than a comment.
const sliceEventsSlot = (src) => {
  const a = src.indexOf("const eventsRailSlot = () => {");
  const b = src.indexOf("\n  };\n", a);
  return a > -1 && b > a ? src.slice(a, b) : "";
};

let passed = 0;
const fail = (m) => { console.error("test-first-screen: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const src = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const code = src.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// 1. The first screen paints real content with no network round trip. The rail
//    is SERVER-rendered from props, so there is nothing to skeleton: if it is
//    ever gated on client state, the 6.4-second blank screen comes back.
ok(/<DaypartRail\b/.test(code), "the rail menu is gone — the first screen has nothing to paint while events load");
ok(/const railMenuBand = railMenu \? \(/.test(code),
  "the rail must render straight off its server prop; gating it on client state re-opens the blank first screen this file exists for");
{
  const railStart = code.indexOf("const railMenuBand = railMenu ? (");
  const railEnd = code.indexOf(") : null;", railStart);
  const railBlock = railStart > -1 && railEnd > railStart ? code.slice(railStart, railEnd) : "";
  ok(railBlock.length > 200, `PROBE: the rail band block was delimited (${railBlock.length} chars) — a -1 here would have scanned the whole file and proven nothing`);
  ok(/<DaypartRail\b/.test(railBlock), "PROBE: the delimited block really is the rail");
  // …and it is actually MOUNTED. A const nothing renders is a first screen
  // with nothing on it, which is the failure this whole file is about.
  ok(/\{railMenuBand\}/.test(code), "the rail band is rendered in the feed, not merely declared");
  // RE-POINTED v8.8 (owner, 2026-08-18): this asserted the rail rendered ABOVE
  // <BestNearby>. The accordion menu no longer renders on "/" at all — the
  // rail's fifteen tiles ARE the menu and its drop is the one-tap ranked
  // answer — so "leads the feed" is now the stronger claim that the rail is
  // the ONLY menu: mounted (above), and the accordion not mounted (below).
  ok(!/\{!browseCat && <BestNearby /.test(code) && !/<BestNearby center=/.test(code),
    "the BestNearby accordion is mounted on the homepage again — it is a second, stacked copy of the rail menu (owner removed it 2026-08-18: 'the menus should only show when the cards is clicked')");
  // Full bleed is the point of the move: inside .wf-col-main the band was
  // capped at the reading measure, which clipped a 15-card deck mid-card.
  ok(/className="wf-fullbleed"/.test(railBlock), "the band runs edge to edge rather than being re-nested in the feed column");
  // Assert the invariant directly rather than blocklisting names: EVERY prop
  // value must come from the server prop or the static rail metadata. A
  // blocklist of client-state identifiers cannot tell `places={railMenu.places}`
  // (the server field) from `places={places}` (the Places search result), and
  // the second one is exactly the 6.4-second regression.
  const values = [...railBlock.matchAll(/\s(\w+)=\{([^}]*)\}/g)].map((m) => [m[1], m[2].trim()]);
  ok(values.length >= 9, `PROBE: the rail is passed its props (found ${values.length})`);
  for (const [name, value] of values) {
    // `center` is the ONE deliberate exception and it is not a first-paint
    // dependency: the rail renders entirely from server props, and center only
    // triggers a LATER re-rank when the reader turns out to be in another metro
    // (the owner's searched-location rule — see scripts/test-beach-geo.mjs).
    // It must stay optional inside the component, which is asserted below.
    // v8.4 — THE EXEMPTION IS FOR THINGS THAT CANNOT GATE FIRST PAINT, and it
    // is deliberately narrow. `center` was already one. Save/itinerary are now
    // two more: they are HANDLERS and PREDICATES, not content. They are read
    // only inside the drop, which renders no HTML until a card is picked and is
    // itself a next/dynamic ssr:false import — so nothing here can make the
    // first screen wait on anything.
    //
    // What is NOT exempt is any prop the rail RENDERS. `places={places}` (the
    // Places search result) is exactly the 6.4-second regression this file
    // exists for, and it is still caught: it is not an on* handler and it is
    // not in this list.
    // v8.23 — initialRail joins them. It is a rail ID read SYNCHRONOUSLY from
    // window.location.search in a mount effect (app/home.js, the ?rail= reader
    // a shared card lands on): it fetches nothing, it renders nothing, and all
    // it decides is which drop opens. The drop emits no HTML until a card is
    // picked and is itself a next/dynamic ssr:false import, so this cannot gate
    // first paint any more than center can. It is NOT content and it is not a
    // handler, which is why it has to be named here rather than slipping
    // through the on* pattern.
    // v8.28 — isLiked / isDisliked join isSaved and isOnTrip, and they are the
    // same class for the same reason: PREDICATES, not content. They are called
    // only inside the drop, which emits no HTML until a card is picked and is
    // itself a next/dynamic ssr:false import, so neither can gate first paint.
    // memberSignalsFor / applyMemberSignal are likewise callables read only
    // inside the open drop — the curator aggregate is fetched per open drop and
    // fails soft. None of them is a prop the rail RENDERS, which is the line
    // this check actually draws (see `places={places}` above — still caught).
    //
    // v8.29.6 — `liked` / `disliked` (main PR #888's map shape) join them. They
    // are client state rather than callables, which is why they need saying out
    // loud: they are read ONLY inside the drop, never in the rail's own markup,
    // so they cannot delay or change the first paint either. The moment one is
    // read outside the drop it stops belonging on this list.
    // `sponsor` (the geo-gated neighborhood partner tile) belongs here for the
    // SAME reason as `center`: it is passed as `locResolved && center ? … : null`,
    // so at first paint — before geolocation resolves — it is null and the rail
    // renders entirely from its server props. The sponsor tile is ADDITIVE and
    // appears only after location resolves; it can no more blank the first
    // screen than `center` can. (If it were ever passed unconditionally, it
    // would stop belonging on this list.)
    // v8.46 — `locName` joins them, on the same terms as `liked`/`disliked`:
    // it is client state read in exactly ONE place, the drop's honest-empty
    // sentence ("Wayfind isn't live in {city} yet"), which only ever renders
    // after a tile has been tapped and the load has settled to uncovered or
    // failed. It appears nowhere in the rail's own markup, so it cannot delay
    // or change the first paint. The moment a tile prints it, it stops
    // belonging on this list. (It is a LABEL only — `center` still does all
    // the ranking, so a label that disagreed with the coordinates could not
    // mislead anything here even if the pairing law let one through.)
    // v8.69 — `sponsorCard` (the PAID place card at the front of one rail's
    // drop) joins them on the strictest reading of this list's own rule, and
    // it is worth stating why rather than assuming, because "it is a sponsor
    // prop and `sponsor` is already allowed" would be the wrong reason:
    // `sponsor` is a TILE in the track, which is first-paint surface, and it
    // earns its place here only through the `locResolved && center ? … : null`
    // conditional. `sponsorCard` is narrower than that. It is read in exactly
    // one place — the `dropList` memo and the map that renders it — and the
    // drop emits no HTML until a reader taps a tile. It appears nowhere in the
    // rail's own markup. So it can neither delay the first screen nor change
    // it, and at first paint it is null anyway (home.js resolves it inside the
    // location effect). The moment a TILE prints it, it stops belonging here.
    // v8.87 — `eventsSlot` joins them, and it is worth stating the reason
    // rather than assuming it, because "it is behind the drop like
    // sponsorCard" is only HALF the reason and the other half is what makes
    // it safe.
    //
    // It carries client-fetched CONTENT — /api/events, the nine-provider feed
    // — which is exactly the class this file's 6.4-second regression came
    // from, and a pre-built node of 24 event cards would have belonged on the
    // wrong side of this line. So it is not a node. It is a THUNK
    // (app/home.js `eventsRailSlot = () => …`), invoked in exactly one place:
    // `selRail.id === "events" && eventsSlot ? … {eventsSlot()}`, inside a
    // drop that emits no HTML until a tile is tapped. Nothing is fetched,
    // allocated or rendered for it at first paint, on the same terms as
    // memberSignalsFor and applyMemberSignal above.
    //
    // THE MOMENT IT IS CALLED OUTSIDE THE DROP — or passed as a node instead
    // of a callable — it stops belonging on this list, and
    // scripts/check-events-rail-renders.mjs asserts the `{eventsSlot()}` call
    // shape so that change cannot be silent.
    const NON_CONTENT = new Set([
      "center", "sponsor", "sponsorCard", "isSaved", "isOnTrip", "initialRail",
      "liked", "disliked", "isLiked", "isDisliked",
      "memberSignalsFor", "applyMemberSignal", "locName", "eventsSlot",
    ]);
    if (NON_CONTENT.has(name) || /^on[A-Z]/.test(name)) continue;
    ok(/^railMenu\.\w+$/.test(value) || value === "RAILS",
      `<DaypartRail ${name}={${value}}> — every rail prop must be server data (railMenu.*) or static metadata (RAILS); anything else makes the first screen wait on a fetch`);
  }
  const rail = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
  ok(/center = null,/.test(rail), "center must default to null — the rail has to paint before geolocation resolves");
  // The premise of the exemption above, asserted rather than assumed: the
  // drop is lazily imported and not server-rendered, so a handler passed to
  // it cannot be on the first-paint path.
  ok(/const IconicPlaceCard = dynamic\(\(\) => import\("\.\/IconicPlaceCard"\),\s*\{\s*ssr:\s*false/.test(rail),
    "the drop's place card must stay a next/dynamic ssr:false import — that is what keeps its props off the first-paint path AND what kept the bundle under the gate");
  ok(/loading:\s*\(\)\s*=>\s*<PlaceCardSkeleton/.test(rail),
    "while the lazy card chunk loads the drop paints a place-card-shaped skeleton, not an empty color slab");
  for (const p of ["isSaved", "isOnTrip", "onSave", "onItinerary", "onOpenPlace", "liked", "disliked", "onLike", "onDislike"]) {
    ok(new RegExp(p + "\\s*=\\s*null").test(rail),
      `${p} must default to null — /v8 mounts this component without it and has to keep working`);
  }
  // v8.17 (owner: "when i go on a card detail and then try to go back
  // everything is gone"). A rail card must open the detail sheet IN PLACE
  // when the app provides the handler — the /p/{id} href alone is a full
  // navigation that destroys the open rail and the feed state, and Back
  // reloads the homepage cold. Assert the wiring at both ends: home.js
  // passes openDetail, the rail forwards it onto the card's onOpen.
  ok(/onOpenPlace=\{\(p\) => \{ try \{ openDetail\(p, "rail_menu"\)/.test(railBlock),
    "the rail band passes openDetail as onOpenPlace — without it every card tap is a full navigation and Back wipes the feed");
  // v8.69 — the expression grew an `!isPaid &&` guard and this assertion
  // FOLLOWED it rather than being relaxed, because the invariant is unchanged:
  // an EARNED card must still open the sheet in place. The one exception is
  // the paid rail card, whose destination is a real first-party page
  // (/florida-events/…) that the in-app place sheet cannot render at all — it
  // carries a sponsor id, not a Google place id, so routing it into openDetail
  // would open a detail for a place that is not in inventory. Both halves are
  // asserted, so neither "the sheet path was dropped" nor "the ad was quietly
  // given the sheet path back" can pass.
  ok(/onOpen=\{!isPaid && onOpenPlace \? \(pl\) => onOpenPlace\(pl\) : undefined\}/.test(rail),
    "DaypartRail forwards onOpenPlace to IconicPlaceCard's onOpen — the sheet path, with the /p/ href kept as the crawlable fallback");
  ok(/href=\{isPaid \? sponsorCard\.href : `\/p\/\$\{encodeURIComponent\(p\.id\)\}`\}/.test(rail),
    "…and the paid card navigates to the page the placement bought, while every earned card keeps its /p/ href");
  // v8.28 — Like/Dislike stay on the rail. The drop used to omit onLike, so
  // IconicPlaceCard fell back to <a href="/p/{id}?action=like"> and every
  // thumb left the open Amazon rail. Both ends of the wire:
  ok(/onLike=\{\(e, p\) => \{ try \{ toggleLike\(e, p\)/.test(railBlock),
    "the rail band passes home.js toggleLike — a missing handler is the ?action=like navigation");
  // v8.88 — RE-ANCHORED, and the invariant is stronger than the string it
  // replaced. The adapter used to pass `pl` — whatever place IconicPlaceCard
  // handed back — which on the paid sponsored card is the row under its
  // SPONSOR id, a key nothing else in the app can read back. It now passes
  // `actionPlace`, the same row under its verified Google place id, so the
  // like lands where the read-back looks. On every unpaid card the two are the
  // same object and nothing changes. The assertion still answers the question
  // it was written for: is a real handler forwarded, or does IconicPlaceCard
  // fall back to <a href="/p/{id}?action=like"> and navigate away (v8.28).
  ok(/onLike=\{onLike \? \(e\) => onLike\(e, actionPlace\) : null\}/.test(rail),
    "DaypartRail forwards onLike onto IconicPlaceCard — the in-place path, carrying the place under the id the stores actually key on");
  ok(/if \(!center \|\| !Number\.isFinite\(center\.lat\)/.test(rail), "…and bail out of the re-rank when it has not");
}
// And it must be gone from where it used to be: a page carrying BOTH the rail
// and the deck shows beach / hidden gems / date night / family twice.
ok(!/function EventsRailSkeleton\(/.test(code) && !/<HeroRail>/.test(code),
  "the promo hero deck is back alongside the rail — that is the same eight cards on one page twice");

// 2. THE CORE RULE: no events-rail branch may depend on `suggested`.
//    `suggested` is the client-side Places result — gating the rail on it is the
//    bug this test exists to prevent.
for (const line of code.split("\n")) {
  if (!line.includes("foryouEvents")) continue;
  if (/suggested\s*!==\s*null/.test(line) || /suggested\s*&&/.test(line)) {
    fail(`an events-rail branch depends on \`suggested\` again:\n    ${line.trim().slice(0, 170)}\n  The rail must not wait on a Google Places search. That gate is what produced 6.4s of blank first screen.`);
  }
}
passed++;

// 3. All three states are handled, so the section is never silently absent.
//    v8: asserted against `eventsRailSlot`, which is the only thing that reads
//    foryouEvents now — the promo deck's three branches went with the deck.
{
  const slot = sliceEventsSlot(code);
  ok(slot.length > 400, `PROBE: the events-rail slot was delimited (${slot.length} chars)`);
  ok(/if \(foryouEvents === null\)/.test(slot), "loading state (null) not handled by the events rail");
  ok(/if \(!shown\.length\) return null;/.test(slot), "empty state (loaded, nothing showable) not handled by the events rail");
  ok(/<RailNav railId="events"/.test(slot), "populated state not handled by the events rail");
}
// The honest zero-events fallback in the feed — a card and three alternative
// intents — must survive. It is the one thing in that position that was never
// the promo deck, and it is what a visitor sees when tonight is genuinely empty.
ok(/Array\.isArray\(foryouEvents\) && foryouEvents\.length === 0/.test(code),
  "the zero-events fallback is gone — a visitor with nothing on tonight now gets silence instead of an alternative");
ok(/Nothing strong tonight nearby/.test(code), "…and it must still say so in words, not just render an empty box");

// 4. Geometry is reserved from SHARED constants, so skeleton and live rail
//    cannot drift apart and the swap stays shift-free.
ok(/const EV_RAIL_MIN_H = \d+/.test(code), "EV_RAIL_MIN_H constant missing");
// v8: the rail reserves its own geometry in CSS rather than from a JS constant,
// because it has no loading state to stay in sync with — the tile's box is
// fixed before the art decodes (width + aspect from --wf8-tw / --wf8-ratio) and
// every <img> carries intrinsic width/height. That is what stops 15 images from
// reflowing the column as they arrive.
{
  const railCss = readFileSync(new URL("../app/components/railMenuCss.js", import.meta.url), "utf8");
  ok(/\.wf8-tile\{[^}]*width:var\(--wf8-tw\)[^}]*height:calc\(var\(--wf8-tw\) \/ var\(--wf8-ratio\)\)/.test(railCss.replace(/\n\s*/g, "")),
    "the rail tile must have a fixed box BEFORE its art decodes, or 15 images reflow the column as they land");
  const railJs = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
  // Date Night is 3:4 (railArtSize), every other tile stays 760×1350. The
  // invariant is that the <img> still carries an intrinsic box — not that
  // every poster is 9:16.
  ok(/railArtSize\(id\)/.test(railJs) && /width=\{artBox\.width\}/.test(railJs) && /height=\{artBox\.height\}/.test(railJs),
    "the rail's <img> must carry intrinsic width/height from railArtSize so the browser reserves the box itself");
  ok(railArtSize("tonight").width === 760 && railArtSize("tonight").height === 1350,
    "the default rail poster box is still 760×1350 — Date Night is the only aspect exception");
  ok(railArtSize("events").height === 1350 && railArtSize("drive").height === 1350 && railArtSize("family").height === 1350,
    "Events, Worth the Drive, and Family stay on the default 9:16 box");
  // v8.19 (owner: "it requires clicking twice … the other cards get really
  // dark"). The tile answers the FIRST tap (touch-action:manipulation kills
  // the double-tap-zoom wait) and an open menu keeps the other tiles alive
  // (opacity .82, never the .45 dead-dim) while the selected tile wears an
  // accent ring instead of relying on darkness for contrast.
  const railCssFlat = railCss.replace(/\n\s*/g, "");
  ok(/\.wf8-tile\{[^}]*touch-action:manipulation/.test(railCssFlat),
    "rail tiles carry touch-action:manipulation — first tap must act, not wait for a possible second");
  ok(!/\.wf8\.is-open \.wf8-tile\{[^}]*opacity:\.4/.test(railCssFlat) && /\.wf8\.is-open \.wf8-tile\{[^}]*opacity:\.8/.test(railCssFlat),
    "an open rail menu never dims the other tiles to the dead-dark .45 — .8x keeps them alive");
  // v8.22 (owner, hours after the v8.20 ring shipped: "I don't like the
  // border — a pulsing glow behind the active card would be more subtle and
  // cool"). Dated reversal: the ring is OUT, the glow is the marker. The
  // invariant stays the same — selection is signaled affirmatively, never by
  // darkness alone — and reduced-motion gets a static glow.
  ok(/wf8SelGlow/.test(railCssFlat) && /\.wf8-tile\.is-sel[^}]*animation:wf8SelGlow/.test(railCssFlat),
    "the selected tile is marked by the pulsing glow (v8.22 owner call), not by darkness alone");
  ok(!/\.wf8-tile\.is-sel[^}]*box-shadow:0 0 0 2\.5px/.test(railCssFlat),
    "…and the v8.20 hard ring has not quietly returned");
  ok(/prefers-reduced-motion:reduce\)[^@]*\.wf8-tile\.is-sel[^}]*animation:none/.test(railCssFlat),
    "reduced-motion keeps a static glow instead of the pulse");
}
// v7.06: the events RAIL moved into the home menu (BestNearby's ninth section),
// so the card-row reserve moved with it. EventsRailSkeleton reserves the promo
// deck it still renders; the rail's own loading box is built in eventsRailSlot
// and is asserted there. Two reserves, each on the thing it is reserving for.
{
  // v8.87 — same re-anchor as sliceEventsSlot above, and the same reason: the
  // slot became a THUNK when it stopped being dead code. "handed to the menu"
  // was the half of this sentence that was not true until now — it was built
  // once and handed to nothing; scripts/check-events-rail-renders.mjs is what
  // asserts the handing-over, which is the part this file never checked.
  const slotStart = code.indexOf("const eventsRailSlot = () => {");
  ok(slotStart > -1, "the events rail is built once, as eventsRailSlot, and handed to the menu");
  const slot = sliceEventsSlot(code);
  ok(slot.length > 400, `PROBE: the events-rail slot was delimited (${slot.length} chars)`);
  ok(slot.includes("EV_RAIL_MIN_H"), "the events rail's loading box reserves the card-row height from EV_RAIL_MIN_H");
  ok(/foryouEvents === null/.test(slot), "…and it renders that box while the events chain is still in flight, not an empty section");
}
ok(/aria-label="Events near you"[^\n]*minHeight: EV_RAIL_MIN_H/.test(code),
  "the live card scroller must reserve minHeight: EV_RAIL_MIN_H to match the skeleton");

// 4b. ALL THREE states must reserve the same floor. Reserving only on the
//     loading state relocates the shift instead of removing it: measured
//     2026-07-21, a sparse market where events resolved to [] collapsed the
//     ~312px skeleton into a ~130px empty state and moved the feed up 200px —
//     one 0.1281 shift. With the shared floor the same run measures 0.0054.
// v8: EV_SECTION_MIN_H is GONE, deliberately. It reserved the promo deck's
// 248px; with the deck removed, keeping it would reserve 248px of empty column
// on every load — the same defect (a reserve that does not match what renders)
// pointing the other way. The one block still in that position is the
// zero-events fallback, a card and three chips, which reserves itself.
// Checked as CODE, not as a string: `code` only strips // comments, and the
// v8 note in app/home.js explaining this removal names the constant inside a
// {/* JSX comment */}. A guard that fires on its own rationale is a guard
// someone deletes.
ok(!/const EV_SECTION_MIN_H\s*=/.test(code) && !/minHeight: EV_SECTION_MIN_H/.test(code),
  "EV_SECTION_MIN_H is back — it reserved space for a promo deck that no longer renders, which is a shift, not a fix");

// 5. The events rail's OWN loading box must still be announced, not just drawn
//    (screen readers get a shimmering grey box otherwise). This moved from
//    EventsRailSkeleton to eventsRailSlot when the deck was removed; the rule
//    did not move, only the thing it applies to.
const skel = sliceEventsSlot(code);
ok(skel.length > 400, `PROBE: the events-rail slot was delimited (${skel.length} chars)`);
ok(/role="status"/.test(skel) && /aria-busy="true"/.test(skel), "the events rail's loading box must expose role=status + aria-busy so assistive tech knows content is loading");
ok(/aria-hidden="true"/.test(skel), "the decorative shimmer blocks must be aria-hidden");
// v7.09 — RENAMED (owner, 2026-08-09): "on the last menu the Happening near
// you should be named Events near you". The section shows concerts, games
// and shows with dates and ticket links; "happening" described a vibe, the
// new name describes the contents.
ok(/Events near you/.test(skel), "the events rail must show its real heading — a row of grey boxes with no label reads as broken, not loading");

// 6. Motion respects the reduced-motion preference (repo-wide rule).
// WF_LAYOUT_CSS moved to app/components/css.js (decomposition wave 1) — still
// the same shell, still the same inline <style> tag, so read the shell.
const cssM = shellSrc().match(/const WF_LAYOUT_CSS = `([^`]*)`/);
ok(!!cssM, "WF_LAYOUT_CSS missing");
ok(/\.wf-sk\{/.test(cssM[1]), "the .wf-sk shimmer style is missing");
ok(/prefers-reduced-motion:reduce\)\{\.wf-sk\{animation:none\}/.test(cssM[1].replace(/\s/g, "")),
  "the shimmer must be disabled under prefers-reduced-motion");

// 7. v8.22 (owner: "when the amazon rail card is selected make sure it
// becomes the main focus on the screen"). The glow (asserted above via
// wf8SelGlow) marks the selection; DaypartRail must also CENTER it — an
// effect keyed on the selection that scrolls the .is-sel tile inside the
// track. Role-asserted: the querySelector, the centering arithmetic and the
// [selected] dependency, in one effect — not the names scattered anywhere.
{
  const dr = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
  ok(/const tile = track\.querySelector\("\.wf8-tile\.is-sel"\)/.test(dr),
    "DaypartRail: the selection effect finds the selected tile in the track");
  ok(/tile\.offsetLeft - \(track\.clientWidth - tile\.clientWidth\) \/ 2/.test(dr),
    "DaypartRail: the selected tile is CENTERED, not merely nudged into view");
  // v8.27 — asserts the PROPERTY, not the file's line order. This used to read
  // /\}, \[selected\]\);\n  const selPlaces/ — it pinned the effect's closing line
  // to whatever text happened to follow it, so adding a comment above the next
  // statement failed a check about a dependency array. Scope to the effect that
  // contains the centering arithmetic and read ITS dependency list.
  {
    const at = dr.indexOf('const tile = track.querySelector(".wf8-tile.is-sel")');
    const close = at >= 0 ? dr.indexOf("}, [", at) : -1;
    ok(close > at && /^\}, \[selected\]\);/.test(dr.slice(close)),
      "DaypartRail: the centering effect re-runs on every selection change");
  }
}

console.log(`test-first-screen: OK — ${passed} assertions (the first screen paints server-rendered content with no fetch; the rail reserves its own box; the events rail is never gated on the Places search; all three states handled; reduced-motion respected)`);
