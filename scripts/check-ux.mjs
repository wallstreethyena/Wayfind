// Guardrail: v4.57 UX decisions. Tile naming, icon semantics, and the
// reservations capture stay intact.
import { readFileSync } from "fs";
const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const cats = readFileSync(new URL("../lib/categories.js", import.meta.url), "utf8");
const fail = (m) => { console.error("check-ux: FAIL — " + m); process.exit(1); };
if (!cats.includes('{ id: "attractions", label: "Things to do" }')) fail('attractions tile must be labeled "Things to do"');
if (cats.includes('label: "Explore"')) fail('vague "Explore" label reappeared');
if (!page.includes('attractions: "🎡"')) fail("attractions emoji not the ferris wheel");
if (!/name === "attractions"\) return \(<svg [^]*?<circle cx="12" cy="9\.5" r="5\.8"/.test(page)) fail("ferris wheel NavIcon missing");
if (!/name === "events"\) return \(<svg [^]*?<circle cx="12" cy="15" r="1\.7"/.test(page)) fail("calendar events NavIcon missing");
if (!page.includes("function addReservation(")) fail("reservation capture missing");
if ((page.match(/addReservation\(/g) || []).length < 3) fail("reservation capture not wired to all outbound booking taps");
if (!page.includes('localStorage.getItem("wf_reservations")')) fail("reservation persistence missing");
if (!page.includes("🧾 Reservations")) fail("Reservations folder UI missing from Itinerary");
if (!page.includes("Wayfind \u00b7 {BUILD_ID}</div>")) fail("visible version label missing (required until bug-hunt ends)");
if (!page.includes('setAttribute("data-wf-build"')) fail("machine-readable build marker missing");
if (!page.includes("Location is approximate")) fail("approximate-location banner missing");
if (!page.includes("setFeedRetry")) fail("feed error retry missing");
if (!/what would interest you today/i.test(page)) fail("mood kicker missing");
if (!page.includes("wf_intro_seen")) fail("intro persistence missing");
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
if (!page.includes("expCollage(a.key)")) fail("revenue hero cards missing photo collages");
if (!page.includes("EXP_COLLAGE_RX")) fail("per-theme collage matching missing");
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
// v5.22 — Right place, right moment (mood buttons + LLM layers):
// (a) the adaptive mood row exists and actually adapts (Outside↔Cozy Indoor);
if (!page.includes("Right place, right moment")) fail("mood row missing from home");
if (!page.includes('_bad ? "cozyindoor" : "outdoors"')) fail("weather-adaptive Outside/Cozy Indoor swap missing");
// v5.24 — "too hot" means the heat index, not the thermometer: the swap must
// judge feels-like when available (91° air / 104° feels-like = Cozy Indoor).
if (!page.includes("weather.feels != null ? weather.feels : weather.temp")) fail("mood-row heat check must prefer feels-like temp");
if (!page.includes('_wkndMorn ? "brunch" : "eatnow"')) fail("weekend-morning Brunch swap missing");
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
