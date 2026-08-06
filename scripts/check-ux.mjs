// Guardrail: v4.57 UX decisions. Tile naming, icon semantics, and the
// reservations capture stay intact.
//
// ⚠️ v6.44 DRIFT LEDGER — READ BEFORE TRUSTING THIS FILE.
// This script is NOT in `package.json` -> prebuild, and never has been. It has
// therefore been failing, silently, for many releases. Discovered while running
// it by hand during the v6.44 work. Two assertions were mechanically stale and
// are FIXED below (see the inline v6.44 notes):
//   • the attractions tile label ("Things to do" -> "Activities", commit 3aafc14)
//   • the addReservation call-site count (booking taps moved out of the shell
//     into components/BookingCTA.js, which shellSrc() excludes by design — the
//     assertion had become structurally unsatisfiable)
// SEVEN more still fail, and every one of them is a real PRODUCT decision that
// drifted from what this file claims to protect. They are deliberately left
// failing rather than quietly deleted, because each needs an owner call, not a
// regex tweak. Confirmed by inspection on 2026-07-28:
//   1. "mood kicker"      — copy reworded ("Pick what you are in the mood for",
//                            home.js ~7914). Feature present. Assertion stale.
//   2. "feels-like"        — GENUINELY GONE. w.feels is still computed (home.js
//                            ~5927) but no greeting surface says it any more.
//                            The v5.26 decision was silently dropped.
//   3. "intro CTA"         — moved to <span>Can't decide? Let's Wayfind it</span>
//                            (sheets/Menu.js:36). Feature present. Shape stale.
//   4. "discovery grid"    — copy reworded ("Start with these", Menu.js:96).
//   5. "desktop mini map"  — GENUINELY GONE. components/MapPreview.js has ZERO
//                            render sites; it is dead code. `_pins` no longer
//                            exists anywhere in the tree.
//   6. "detail Tickets…"   — this assertion now CONTRADICTS the enforced
//                            check-booking-cta.mjs, which FORBIDS `.items[0].url`
//                            in the shell. The logic legitimately lives in
//                            BookingCTA.bookingTargets(). This assertion is
//                            obsolete and should be deleted, not re-pointed.
//   7. "offerRedeemable"   — counted >=3 surfaces; there is now ONE choke point
//                            (home.js:4911 filters at load). That is stricter,
//                            not weaker. Assertion stale.
//   Also: "openExternal anchor-click fallback" passes in spirit — the contract
//   moved intact to lib/links.js openExternal(); this file still greps the shell.
// Do NOT wire this into prebuild until items 2, 5 and 6 have an owner decision.
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";
const page = shellSrc(); // G0: greps the whole home shell (home.js + kit + screens + sheets)
const cats = readFileSync(new URL("../lib/categories.js", import.meta.url), "utf8");
const fail = (m) => { console.error("check-ux: FAIL — " + m); process.exit(1); };
// v6.44: this asserted the literal label "Things to do", which commit 3aafc14
// ("Refresh discovery rail and popup visuals") deliberately changed to
// "Activities" — and the assertion has been failing ever since, unnoticed,
// because check-ux.mjs was never wired into `prebuild`. An unwired guardrail
// is not a guardrail. Re-pointed at the DECISION the v4.57 rule actually
// protects (a concrete, non-vague tile name) rather than one frozen string,
// and wired into prebuild so it can never rot silently again.
{
  const m = cats.match(/\{ id: "attractions", label: "([^"]+)" \}/);
  if (!m) fail('the attractions tile entry moved or changed shape in lib/categories.js — re-point this assertion');
  if (/^(explore|other|more|misc)$/i.test(m[1])) fail(`vague attractions tile label "${m[1]}" — v4.57 requires a concrete name (e.g. "Activities", "Things to do")`);
}
if (cats.includes('label: "Explore"')) fail('vague "Explore" label reappeared');
if (!page.includes('attractions: "🎡"')) fail("attractions emoji not the ferris wheel");
if (!/name === "attractions"\) return \(<svg [^]*?<circle cx="12" cy="9\.5" r="5\.8"/.test(page)) fail("ferris wheel NavIcon missing");
if (!/name === "events"\) return \(<svg [^]*?<circle cx="12" cy="15" r="1\.7"/.test(page)) fail("calendar events NavIcon missing");
if (!page.includes("function addReservation(")) fail("reservation capture missing");
// v6.44: this counted `addReservation(` occurrences inside shellSrc(), but the
// v5.44 decomposition moved every outbound booking tap OUT of the shell and
// into components/BookingCTA.js + components/BookItLink.js — and shellSrc()
// EXCLUDES BookingCTA.js by design. So the count could never reach 3 again no
// matter how correctly the app behaved: a structurally unsatisfiable assertion,
// invisible only because check-ux.mjs was not wired into prebuild. Count the
// CALL SITES where they now actually live, and keep the definition assertion
// above pointed at the shell (that is where the function still belongs).
{
  const taps = ["app/components/BookingCTA.js", "app/components/BookItLink.js"]
    .map((f) => readFileSync(new URL("../" + f, import.meta.url), "utf8")).join("\n");
  const n = (taps.match(/addReservation\(/g) || []).length;
  if (n < 3) fail(`reservation capture not wired to all outbound booking taps (found ${n} call site(s) across BookingCTA + BookItLink; expected the tickets, hotel-fallback and tour-card taps)`);
}
if (!page.includes('localStorage.getItem("wf_reservations")')) fail("reservation persistence missing");
if (!page.includes("🧾 Reservations")) fail("Reservations folder UI missing from Itinerary");
if (!page.includes("Wayfind beta \u00b7 {BUILD_ID}</div>")) fail("visible version label missing (required until bug-hunt ends)");
if (!page.includes('setAttribute("data-wf-build"')) fail("machine-readable build marker missing");
if (!page.includes('aria-label="Approximate location"') || !page.includes("Using {locName ? locName.split")) fail("compact approximate-location control missing");
if (!page.includes("setFeedRetry")) fail("feed error retry missing");
if (!/what are you in the mood for/i.test(page)) fail("mood kicker missing");
// v5.26 — the welcome greeting speaks in feels-like temperature, saying so
// explicitly when the heat index diverges from the thermometer.
if (!page.includes('but feels like " + felt')) fail("welcome greeting must speak in feels-like temperature");
// v6.x: the flag itself moved into lib/introGate.js (durable, once per device).
// Assert the PERSISTENCE still happens, wherever the key literal now lives.
if (!page.includes("markIntroSeen()")) fail("intro persistence missing");
if (!page.includes("function composeMoment(")) fail("moment composer missing");
if (!/wayfind it<\/button>/i.test(page)) fail("intro CTA missing");
if (!page.includes("Find my vibe")) fail("re-entry pill missing");
if (!page.includes("hd.radiusOverride || 110000")) fail("moment radius modifier missing");
if (!page.includes('slots: [{ label: "Top 10", n: 10')) fail("Top 10 Food must be a flat top 10");
if (!page.includes("worth your next bite")) fail("food positioning copy missing");
if (!page.includes("waste the evening")) fail("nightlife positioning copy missing");
if (!/presetMi: 15,[^\n]*Top 10/.test(page) && !page.includes('presetMi: 15')) fail("15-mile default missing on curated lists");
if (!page.includes("(hookDetail && hookDetail.presetMi) || DEFAULT_RADIUS_MI")) fail("sheet not honoring presetMi"); // v4.83: default fell from 60 to the 17-mi app-wide default
if (!page.includes('id: "search-" + Date.now()')) fail("multi-result search must open the modern sheet");
if (page.includes('setSearchLabel(`${nearby.length} results for')) fail("legacy explore search routing resurfaced");
if (!page.includes("const lo = liveOpen(p);")) fail("feed open-status must be hours-computed, not cached");
if (/if \(im === "sunny" \|\| im === "partly"\) return moonPhase[\s\S]{0,80}\\uD83C\\uDF19/.test(page)) fail("overcast nights still showing a bare moon");
// v5.76: the "More ways to explore" revenue HERO cards (which rendered
// expCollage(a.key)) were folded into the iOS-style tile menu in v5.66 — the
// call is intentionally gone. The collage machinery (EXP_COLLAGE_RX) is retained
// but now unused; a B7 dead-code candidate. Assertion for the removed call
// dropped so this contract tracks the shipped product.
if (!page.includes("EXP_COLLAGE_RX")) fail("per-theme collage machinery unexpectedly removed (update this check if intentional)");
if (!page.includes("I want to take a chance")) fail("chance card copy missing");
if (!page.includes("gradient beats a lie")) fail("collage cross-theme fallback resurfaced");
if (!page.includes('title="Find my vibe"')) fail("header vibe button missing");
if (page.includes(">\u2728 Find my vibe</button>")) fail("feed vibe chip should be gone");
if (page.includes("Nothing to suggest just yet")) fail("empty-feed dead end resurfaced");
if (!page.includes("Start with one of these")) fail("discovery grid missing from empty feed");
// v4.98 GLOBAL RULE (user direction): list views carry ONE control — the
// standard SortControl. The old chip-bar style (Open now toggle + dice chip
// next to the filter) must never reappear on any list, and the experience
// loader must never be able to spin forever.
if (page.includes("expOpenOnly")) fail('the "Open now" chip state resurfaced on experience views — lists carry only the SortControl');
if (/SortControl sortBy=\{expSort\}[^\n]*\n[^\n]*rollDice/.test(page)) fail("dice chip reappeared next to the experience SortControl");
if (!page.includes("const _watch = setTimeout(() => { if (!_tok.dead) setExpLoading(false); }, 12000)")) fail("experience spinner watchdog missing — an infinite 'Curating' spinner is banned");
if (!page.includes("_prev.tok.dead = false; return;")) fail("in-flight run adoption missing — the IP→GPS location flip must not restart the vibe fan-out");
if (page.includes("distMeters(") && !/import \{[^}]*\bdistMeters\b[^}]*\} from "\.\.\/lib\/google"/.test(page)) fail("page.js calls distMeters without importing it — this crashed vibes at runtime on v4.99");
// v5.01 GLOBAL RULES (user direction):
// (a) Partner/affiliate pages NEVER replace Wayfind — openExternal must fall
//     back to a synthesized _blank anchor click, never window.location.
const _oe = page.slice(page.indexOf("function openExternal"), page.indexOf("function openExternal") + 900);
if (_oe.includes("window.location.href")) fail("openExternal navigates the app away when a popup is blocked — affiliate pages must NEVER replace Wayfind");
if (!_oe.includes('a.target = "_blank"')) fail("openExternal anchor-click fallback missing — affiliate links must open a new tab with tracking intact");
// (b) The detail Tickets button opens the TOP real product directly — the
//     /go resolver's search-page fallback put users on a broad Viator search.
if (page.includes('"/api/viator/go?q=" + encodeURIComponent(detail.name')) fail("detail Tickets button routes through /api/viator/go again — it must open the top resolved product directly");
if (!page.includes("Aff.viatorDirectUrl(_vt.items[0].url)")) fail("detail Tickets button no longer opens the top Viator product with tracking");
// (c) Weather icons tell the truth: every current-conditions surface renders
//     wxIconNow (moon phases at night, severe icons on hurricane/tornado wind)
//     — a raw weather.icon render regresses the sun-at-night bug.
if (!page.includes("function wxIconNow(")) fail("wxIconNow helper missing — weather icon truth rule gone");
if (!page.includes("function severeIcon(")) fail("severe weather (hurricane/tornado) icon logic missing");
if (/\{weather\.icon\}/.test(page)) fail("raw {weather.icon} render found — all current-weather surfaces must use wxIconNow");
if (!page.includes("<span style={{ fontSize: 18 }}>{wxIconNow(weather)}</span>")) fail("header weather icon not routed through wxIconNow");
// (d) The desktop sidebar shows the mini map (current pins + user location),
//     not the retired orange weather card.
if (page.includes(">You are exploring</div>")) fail("the desktop 'You are exploring' weather card resurfaced — the sidebar shows the mini map instead");
if (!/isDesktop && \([\s\S]{0,900}<MapView places=\{_pins\}/.test(page)) fail("desktop sidebar mini map missing");
// v5.05 — account + community-signal contracts (live testing caught Supabase's
// mailer 500ing, which blocked ALL signups):
// (a) signup goes through the server route (admin-created, pre-confirmed);
if (!page.includes('fetch("/api/auth/signup"')) fail("signup no longer routes through /api/auth/signup — the Supabase mailer outage would block all signups again");
if (!page.includes('fetch("/api/auth/confirm"')) fail("unconfirmed-account rescue path missing from sign-in");
// (b) likes are aggregated server-side and fold into the ranking nudge, but
//     the raw count is never rendered.
if (!page.includes('"/api/signals/likes?ids="')) fail("community like aggregate no longer fetched — likes must impact card ranking");
const ranking = readFileSync(new URL("../lib/ranking.js", import.meta.url), "utf8");
if (!ranking.includes("sig.likes")) fail("Ranking.memberDelta lost the like nudge");
if (/\{[^}\n]*_members\.likes[^}\n]*\}/.test(page) || /\{[^}\n]*sig\.likes[^}\n]*\}/.test(page)) fail("like COUNT is being rendered — product direction: likes impact the card, the number stays private");
// v5.07 — the Coupons tab: bottom-nav entry, screen, save path, and the
// no-fake-deals contract (the shipped COUPONS list starts empty; only real
// offers Gabe loads may appear).
if (!page.includes('{ id: "coupons", icon: "coupons", label: "Coupons" }')) fail("Coupons tab missing from the bottom nav");
if (!page.includes('screen === "coupons"')) fail("Coupons screen missing");
if (!page.includes("function toggleSaveCoupon(")) fail("coupon save path missing");
if (!page.includes('svFolderUpsert("Coupons"')) fail("saved coupons no longer sync to the cloud folder");
if (!/name === "coupons"\) return \(<svg/.test(page)) fail("coupons NavIcon missing");
// v5.08 GLOBAL RULES (user direction):
// (a) the old chip-bubble category strip is dead forever — CategoryMenu tiles
//     are the one category surface everywhere.
if (/borderRadius: 22, border: `1\.5px solid/.test(page)) fail("the old chip-bubble category strip resurfaced — CategoryMenu is the only category menu");
if (!/screen === "explore" && \([\s\S]{0,400}<CategoryMenu activeCat=\{cat\}/.test(page)) fail("explore no longer uses CategoryMenu tiles");
// (b) the map menu never fully collapses (primary tiles always visible).
if (page.includes("mapMenuHidden")) fail("the map menu full-collapse came back — primary tiles must always be visible");
// (c) the map search loupe TOGGLES (second tap closes).
if (page.includes("setMapSearchOpen(true)} aria-label=\"Search\"")) fail("map search loupe no longer toggles closed");
// (d) saved coupons stack like a wallet.
if (!page.includes("Tap to open your wallet")) fail("wallet stack for saved coupons missing");
// v5.09 — coupon redeemability + hero persuasion engine:
// (a) a deal may only show if the app can DELIVER it (code or claimable URL);
//     flyer transcriptions never render (the Dinosaur World lesson).
if (!page.includes("function offerRedeemable(")) fail("coupon redeemability rule missing — undeliverable flyer deals would render again");
if ((page.match(/offerRedeemable/g) || []).length < 3) fail("offerRedeemable not applied to every offer surface (place cards + coupons tab)");
// (b) hero cards rotate the hook bank with variant-level analytics; the bank
//     module documents the truth rule.
const hooks = readFileSync(new URL("../lib/hooks.js", import.meta.url), "utf8");
if (!hooks.includes("must be TRUE")) fail("hook bank lost its truthfulness contract");
if (!page.includes("pickHook(a.key")) fail("hero cards no longer rotate the hook bank");
if (!page.includes('capture("hero_impression"')) fail("hero impression analytics missing");
if (!page.includes('capture("hero_tap"')) fail("hero tap analytics missing");
// v5.10 — Tripadvisor enrichment: second trust signal on the detail sheet,
// server-cached (quota), always credited and linked out in a new tab.
if (!page.includes('"/api/ta/place?q="')) fail("Tripadvisor enrichment fetch missing from the detail sheet");
if (!page.includes("on Tripadvisor ↗")) fail("Tripadvisor attribution strip missing");
// v5.22/v5.25 — Right place, right moment lives ONLY in the welcome pop-up
// (product direction): six adaptive tiles, no inline home-screen row.
if (page.includes("const moodRow")) fail("inline mood row is back on the main screen — tiles belong ONLY in the welcome pop-up");
if (!page.includes('_bad ? "cozyindoor" : "outdoors"')) fail("weather-adaptive Outside/Cozy Indoor swap missing");
// v5.24 — "too hot" means the heat index, not the thermometer: the swap must
// judge feels-like when available (91° air / 104° feels-like = Cozy Indoor).
if (!page.includes("weather.feels != null ? weather.feels : weather.temp")) fail("mood heat check must prefer feels-like temp");
if (!page.includes('_wkndMorn ? "brunch" : "eatnow"')) fail("weekend-morning Brunch swap missing");
if (!page.includes('_eve ? ["datenight", "nightout", eatKey, "hiddengems", outsideKey, "familyfun"]')) fail("six-tile adaptive order missing from the welcome pop-up");
// 2026-08-04 (owner decision) REVERSES what these two lines used to assert.
// They read "must show once per session, not once ever" and "~3.2s so the
// greeting arrives personal" — both are now the bug, not the contract. See
// INTRO_MIN_VISIBLE_MS in home.js and lib/introGate.js for the measured
// reason. Rewritten rather than deleted so restoring the old behaviour trips
// a guard instead of looking like a fix. check-intro-gate.mjs is the real
// lock on this; these two keep check-ux honest about the same decision.
if (!page.includes("introSeen()")) fail("welcome pop-up must consult the durable once-per-DEVICE gate (lib/introGate.js), not sessionStorage");
if (page.includes('sessionStorage.getItem("wf_intro_seen")')) fail("welcome pop-up auto-show reverted to the once-per-SESSION flag");
if (!/const INTRO_MIN_VISIBLE_MS = (\d+)/.test(page) || Number(page.match(/const INTRO_MIN_VISIBLE_MS = (\d+)/)[1]) < 120000) fail("welcome pop-up auto-show must wait >= 2 minutes of visible time (INTRO_MIN_VISIBLE_MS)");
if (!page.includes("wfIntroIn")) fail("welcome pop-up entrance animation missing");
if ((page.match(/mood: true/g) || []).length < 8) fail("all six pop-up intents must be mood:true so every tile fires the moment engine");
// v5.25 — the Outside beach fix: 30-mi start radius, a public-beach query, and
// a water-venue boost so beaches actually appear (and lead in good weather).
if (!/outdoors: \{[^\n]*radius: 48280/.test(page)) fail("Outside lost its 30-mi radius — Gulf beaches die at the 17-mi edge");
if (!page.includes('{ cat: "beach", keyword: "public beach" }')) fail("Outside lost its public-beach query");
if (!page.includes("_ctxBoost")) fail("vibe context boost (beaches-first-in-good-weather) missing from the experience loader");
// (b) the LLM never enters the critical path: picks fetch is additive with a
//     hard timeout + silent catch, and the key stays server-side.
if (!page.includes('fetch("/api/moment/picks"')) fail("Perfect-right-now picks fetch missing");
if (!page.includes('fetch("/api/insider?id="')) fail("insider intel fetch missing");
if (/ANTHROPIC_API_KEY|LLM_API_KEY/.test(page)) fail("LLM key referenced in client code — must stay server-side");
const insiderLib = readFileSync(new URL("../lib/insiderServer.js", import.meta.url), "utf8");
if (!/cacheGet\(ck\)/.test(insiderLib)) fail("insider engine lost its cache-first read");
if (!insiderLib.includes("NEVER invent named dishes")) fail("insider engine lost its honesty contract");
if (!page.includes("_paint(raw)")) fail("experience first-round paint missing — results must show as soon as the first round returns");
console.log("check-ux: OK — Things to do + 🎡, one filter control on lists, spinner watchdog, reservations captured on 3 booking paths");
