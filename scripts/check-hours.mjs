// Guardrail: the "hours / open-closed" contract (v6.31, extended v6.34).
//
// Three live bugs this locks shut, forever:
//  1) The detail sheet sat on "Loading hours…" permanently whenever the extra
//     place-detail fetch failed or returned nothing — because a bare `null` was
//     cached and null reads as "still fetching". The fix caches a resolved
//     sentinel and falls back to the weekday text captured at search time.
//  2) The list card said "Open" while the detail sheet said "Closed", because
//     the list computes open/closed LIVE from the hours periods (liveOpen) while
//     the sheet trusted the stale cached openNow. Open/closed must be computed
//     from the same source everywhere.
//  3) The sheet said "Open now" while the hours panel said "Hours not listed"
//     (Escape Reality, July 2026): a cached fsq open_now boolean with no hours
//     behind it was trusted as a status. Snapshots now assert only behind a
//     freshness stamp, and hours evidence travels as a bundle in twin-merges.
import { readFileSync } from "fs";
import { shellSrc } from "./lib/shellSrc.mjs";

const fail = (m) => { console.error("check-hours: FAIL — " + m); process.exit(1); };
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const detail = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
const shell = shellSrc();

// 1) Search results must carry the human weekday text, so the sheet has hours
//    to show without waiting on (or depending on) the second fetch.
if (!google.includes("weekdayDescriptions"))
  fail("lib/google.js no longer captures regularOpeningHours.weekdayDescriptions on search results");

// 2) openDetail must never cache a bare null place-detail (that = perpetual spinner).
//    A resolved sentinel has to be stored when the fetch comes back empty.
if (!/if \(!extra\) extra = \{[^}]*_resolved: true/.test(home))
  fail("openDetail can cache a bare null place-detail — the sheet will hang on 'Loading hours…'");

// 3) The sheet must fall back to the search-time weekday text.
if (!detail.includes("detail.oh.weekdayDescriptions"))
  fail("Detail sheet does not fall back to detail.oh.weekdayDescriptions for hours");

// 4) "Loading hours…" may only show while the fetch is genuinely unresolved
//    (detailExtra === null), never as the resting state.
if (!/detailExtra === null \? "Loading hours…"/.test(detail))
  fail("Detail hours 'Loading…' state is not gated on detailExtra === null");

// 5) The detail header open/closed must be computed live (openState/liveOpen),
//    never straight off the stale cached openNow.
if (!detail.includes("liveOpen(detail)") || !detail.includes("openState"))
  fail("Detail header open/closed is not computed live via liveOpen(detail)");

// 6) liveOpen stays the single source of truth for the open/closed pill.
if (!/function liveOpen\(p\)/.test(shell))
  fail("liveOpen() helper is missing from the shell");

// 7) v6.34 — an unverifiable openNow snapshot must never assert a status.
//    businessStatus may only trust place.openNow behind the freshness gate.
const bs = readFileSync(new URL("../lib/businessStatus.js", import.meta.url), "utf8");
if (!bs.includes("SNAPSHOT_TRUST_MS"))
  fail("lib/businessStatus.js lost the snapshot freshness gate (SNAPSHOT_TRUST_MS)");
if (!/hoursAsOf != null && \(now - hoursAsOf\) <= SNAPSHOT_TRUST_MS/.test(bs))
  fail("the openNow snapshot is trusted without a freshness check");

// 8) v6.34 — fsq rows must stamp hoursAsOf at capture, or every fresh fsq
//    open_now boolean would degrade to unknown and honest pills disappear.
const fsq = readFileSync(new URL("../app/api/fsq/search/route.js", import.meta.url), "utf8");
if (!fsq.includes("hoursAsOf"))
  fail("app/api/fsq/search no longer stamps hoursAsOf when capturing open_now");

// 9) v6.34 — the sources twin-merge must carry the freshness stamp (and the
//    hours bundle) with the boolean, never the bare boolean alone.
const sources = readFileSync(new URL("../lib/sources.js", import.meta.url), "utf8");
if (!/twin\.hoursAsOf == null && fp\.hoursAsOf != null/.test(sources))
  fail("lib/sources.js twin-merge copies openNow without its hoursAsOf stamp");

// 10) v6.34 — GLOBAL: the merged pool's openNow FIELD is normalized through
//     the one status source at rank time, and the ranking nudge decides via
//     isOpenNow — so every direct reader of p.openNow (filters, sorts, hero
//     logic, map marker colors, LLM payloads) inherits the freshness rule.
if (!/p\.openNow = isOpenNow\(p\)/.test(sources))
  fail("lib/sources.js _rank no longer normalizes p.openNow via isOpenNow");
const ranking = readFileSync(new URL("../lib/ranking.js", import.meta.url), "utf8");
if (!/const lo = isOpenNow\(place\)/.test(ranking))
  fail("lib/ranking.js dayFit reads the raw cached boolean instead of isOpenNow");

console.log("check-hours: OK — hours never hang, open/closed computed live everywhere, snapshots only assert while fresh");
