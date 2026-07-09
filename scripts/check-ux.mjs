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
if (page.includes("Wayfind {BUILD_ID}</div>") || page.includes("{BUILD} \u00b7 {BUILD_ID}")) fail("visible version label reappeared in public UI");
if (!page.includes('setAttribute("data-wf-build"')) fail("machine-readable build marker missing");
if (!page.includes("Location is approximate")) fail("approximate-location banner missing");
if (!page.includes("setFeedRetry")) fail("feed error retry missing");
if (!page.includes("Find the right place. ")) fail("intro headline missing");
if (!page.includes("wf_intro_seen")) fail("intro persistence missing");
if (!page.includes("function composeMoment(")) fail("moment composer missing");
if (!page.includes("Build my adventure")) fail("intro CTA missing");
if (!page.includes("Find my vibe")) fail("re-entry pill missing");
if (!page.includes("hd.radiusOverride || 110000")) fail("moment radius modifier missing");
console.log("check-ux: OK — Things to do + 🎡, hotel/calendar icons, reservations captured on 3 booking paths");
