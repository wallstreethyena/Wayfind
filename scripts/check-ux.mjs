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
if (!page.includes("_paint(raw)")) fail("experience first-round paint missing — results must show as soon as the first round returns");
console.log("check-ux: OK — Things to do + 🎡, one filter control on lists, spinner watchdog, reservations captured on 3 booking paths");
