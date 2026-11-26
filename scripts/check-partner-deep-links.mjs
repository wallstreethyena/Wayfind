// scripts/check-partner-deep-links.mjs — partner buttons land on the exact
// product when we hold one, and every Viator search link says where it came from.
//
// Partner deep-link audit, 2026-11-25 (30 days of human clicks):
//   * 349 of 3,833 Viator clicks (9%) opened a Viator SEARCH page. 347 of them
//     carried no surface ("viator_legacy"), so nobody could tell which button
//     produced them.
//   * The place card's verified "Book" passed the place (no product code) to
//     ViatorCommerceLink, which fell to search mode on the place name.
//   * The Detail sheet's tour list painted "Search Viator — No verified product
//     for this place" for places wf_place_products holds a verified product for.
//
// What this locks (CALLS where the code can run, source shape where it cannot):
//   1. Every experienceGoUrl() call site in app/ and lib/ passes an opts object
//      with a surface, so a search redirect is always attributable.
//   2. bookingTargets()'s search fallback carries a surface (default
//      booking_fallback, or the caller's).
//   3. BookingCTA's tour list tries the verified place product (placeProductHref)
//      BEFORE the "Search Viator" fallback, and holds the fallback while the
//      per-place product fetch is in flight.
// The exact-product builder itself (placeProductHref) is called with good and
// hostile inputs in scripts/test-card-booking.mjs.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
let pass = 0;
const fail = (m) => { console.error("check-partner-deep-links: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// Strip comments and string/template contents so a mention inside a comment or
// a string can neither satisfy nor trip an assertion.
function stripCode(src, keepStrings = false) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += q; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") i++; out += keepStrings || src[i] === "\n" ? src[i] : " "; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

// Balanced-paren argument text of every NAME( call in code-only source.
function callArgs(code, name) {
  const calls = [];
  const re = new RegExp("(?<![\\w$])" + name.replace(/\./g, "\\.") + "\\s*\\(", "g");
  let m;
  while ((m = re.exec(code))) {
    let depth = 1, j = m.index + m[0].length;
    const start = j;
    while (j < code.length && depth) { if (code[j] === "(") depth++; else if (code[j] === ")") depth--; j++; }
    calls.push({ at: m.index, args: code.slice(start, j - 1) });
  }
  return calls;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(m?js|jsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

// 1. Every experienceGoUrl call site carries a surface.
{
  const files = [...walk(path.join(root, "app")), ...walk(path.join(root, "lib"))];
  let sites = 0;
  const missing = [];
  for (const f of files) {
    const raw = readFileSync(f, "utf8");
    if (!raw.includes("experienceGoUrl")) continue;
    // Keep string CONTENTS for the surface key check: strip comments only first,
    // then use the fully stripped copy to find calls (same offsets).
    const code = stripCode(raw);
    for (const call of callArgs(code, "experienceGoUrl")) { // also matches Aff.experienceGoUrl(
      const before = code.slice(Math.max(0, call.at - 25), call.at);
      if (/function\s+$/.test(before)) continue; // the definition itself
      sites++;
      if (!/\{[^}]*\bsurface\b/.test(call.args)) missing.push(path.relative(root, f) + " @" + code.slice(0, call.at).split("\n").length);
    }
  }
  // Positive control: the probe must find the known call sites, or a parser
  // regression would make "nothing missing" vacuous.
  console.log("check-partner-deep-links: " + sites + " experienceGoUrl call sites scanned in " + files.length + " app/lib files");
  ok(sites >= 8, `the call-site probe found ${sites} experienceGoUrl calls (expected at least 8; a smaller number means the probe broke)`);
  ok(missing.length === 0, "every experienceGoUrl() call passes { surface } so its search redirect is attributable — missing at: " + missing.join(", "));
}

// 2. bookingTargets' search fallback carries a surface (called, not grepped).
{
  const { bookingTargets } = await import("../lib/bookingResolve.js");
  const museum = { id: "ChIJtestMuseum0001", name: "Test Art Museum", address: "1 Main St, Sarasota, FL 34236, USA", types: ["museum", "tourist_attraction"] };
  const t = bookingTargets(museum, "museum", null, "Sarasota, FL");
  ok(typeof t.goFallback === "string" && /[?&]intent=search(?:&|$)/.test(t.goFallback), "fixture reaches the search fallback (positive control)");
  ok(/[?&]surface=booking_fallback(?:&|$)/.test(t.goFallback), "the default search fallback is tagged surface=booking_fallback, got: " + t.goFallback);
  const t2 = bookingTargets(museum, "museum", null, "Sarasota, FL", { surface: "detail_primary" });
  ok(/[?&]surface=detail_primary(?:&|$)/.test(t2.goFallback), "a caller's surface wins on the search fallback");
}

// 3. BookingCTA's list prefers the verified place product, and the sheet's
//    primary passes its surface.
{
  const code = stripCode(readFileSync(path.join(root, "app/components/BookingCTA.js"), "utf8"), true);
  ok(/const\s+verifiedPlaceProduct\s*=\s*usePlaceProduct\(/.test(code), "BookingCTA resolves the place's verified product (usePlaceProduct)");
  const listAt = code.indexOf('variant === "list"');
  ok(listAt > 0, "the list branch exists (positive control)");
  const list = code.slice(listAt);
  const ppAt = list.search(/placeProductHref\(\s*verifiedPlaceProduct/);
  const fbAt = list.search(/Aff\.experienceGoUrl\(\s*detail\.name/);
  ok(ppAt > 0 && fbAt > 0, "the list branch has both the verified-product row and the search fallback");
  ok(ppAt < fbAt, "the verified place product is tried BEFORE the Search Viator fallback");
  ok(/vtEntry\s*&&\s*vtEntry\.loading\)\s*return null/.test(list.slice(0, fbAt)), "the search fallback is held while the per-place product fetch is in flight");
  ok(/placeEvidence\(viaTours,\s*placeId\),\s*surface:/.test(code), "the sheet's primary passes its surface into bookingTargets");
  // Hooks above the first conditional return (check-hook-order also guards this).
  const hookAt = code.indexOf("const verifiedPlaceProduct");
  const firstReturn = code.search(/\n\s{2}if \([^)]*\) return /);
  ok(firstReturn === -1 || hookAt < firstReturn, "usePlaceProduct is declared before any early return");
}

console.log(`check-partner-deep-links: OK — ${pass} assertions (exact place product before search; every Viator search link tagged with its surface)`);
