// v5.77 prebuild gate — the outbound-link validator (lib/links.js). This is the
// regression net for the "Safari can't open the page" / "Get tickets -> Expedia"
// class: safeUrl must reject anything that can't be a real destination (so it
// never reaches an href), ticketHref must yield null for a missing/bad ticket
// URL (so the caller HIDES the button instead of rendering a wrong or broken
// one), and both must be pure — no window, no fetch.
import { safeUrl, isSafeUrl, ticketHref, openExternal } from "../lib/links.js";

let failures = 0;
const fail = (m) => { console.error("test-links: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

// ── safeUrl REJECTS everything that must never reach an href ──
for (const bad of ["", "   ", null, undefined, 42, {}, "N/A", "n/a", "TBD", "TBA", "null", "undefined", "none", "-", "#",
  "javascript:alert(1)", "data:text/html,x", "mailto:a@b.com", "tel:911", "about:blank",
  "//evil.com", "notaurl", "http://", "https://", "http://localhost", "ftp://files.example.com", "example.com",
  "http://x y.com", "has spaces in it"]) {
  ok(safeUrl(bad) === null, `safeUrl must reject ${JSON.stringify(bad)}`);
}

// ── safeUrl ACCEPTS real destinations ──
ok(safeUrl("https://www.ticketmaster.com/event/123") === "https://www.ticketmaster.com/event/123", "accepts a real https ticket URL");
ok(safeUrl("http://frrm.org") === "http://frrm.org/", "accepts http with a real host (normalizes)");
ok(safeUrl("  https://viator.com/tours  ") === "https://viator.com/tours", "trims surrounding whitespace");
ok(safeUrl("/api/viator/go?q=ringling") === "/api/viator/go?q=ringling", "accepts an app-relative redirect route");
ok(safeUrl("/events/sarasota/this-weekend") === "/events/sarasota/this-weekend", "accepts an internal path");
ok(isSafeUrl("https://a.com") === true && isSafeUrl("") === false, "isSafeUrl mirrors safeUrl");

// ── ticketHref: null for a missing/bad ticket URL (caller hides the button) ──
ok(ticketHref(null) === null, "ticketHref(null) is null");
ok(ticketHref({}) === null, "an event with no url yields null (hide the button)");
ok(ticketHref({ url: "" }) === null, "empty ticket url yields null");
ok(ticketHref({ url: "N/A" }) === null, "junk ticket url yields null — never a broken href");
ok(ticketHref({ url: "not a url" }) === null, "malformed ticket url yields null");
{
  const h = ticketHref({ url: "https://www.ticketmaster.com/e/1" });
  // Ticketmaster now routes through the Impact redirect (ticketmaster.evyy.net/c/7475855),
  // carrying the real destination URL-encoded in `u` — never a bare ticketmaster.com href.
  ok(typeof h === "string" && h.indexOf("https://ticketmaster.evyy.net/c/7475855/") === 0, "a real TM url becomes an Impact redirect (evyy.net/c/7475855)");
  ok(h.includes("u=https%3A%2F%2Fwww.ticketmaster.com%2Fe%2F1"), "the real ticketmaster.com destination is URL-encoded inside the redirect's `u`");
}
ok(ticketHref({ ticketUrl: "https://frrm.org/ride" }) != null, "reads the ticketUrl field too");

// ── openExternal: EXACTLY ONE window per activation (2026-10-24) ──
// Regression: window.open(url, "_blank", "noopener") returns null on SUCCESS
// (noopener severs the handle), so the old code fell through to its synthetic
// anchor click and opened a second identical tab — one Directions tap on the
// Detail sheet, two Google Maps tabs. Each scenario below counts real opens.
{
  const MAPS = "https://www.google.com/maps/search/?api=1&query=Ringling%20Museum%20Sarasota&query_place_id=ChIJtest";
  const run = (openImpl) => {
    let windowOpens = 0, anchorClicks = 0, openedUrl = null, lastHandle = null, features = "unset";
    const anchor = { href: "", target: "", rel: "", click() { anchorClicks++; }, remove() {} };
    globalThis.window = { open(u, t, f) { windowOpens++; openedUrl = u; features = f; const r = openImpl(u); lastHandle = r; return r; } };
    globalThis.document = { createElement: () => anchor, body: { appendChild() {} } };
    const result = openExternal(MAPS);
    delete globalThis.window; delete globalThis.document;
    return { windowOpens, anchorClicks, openedUrl, lastHandle, features, result, anchor };
  };

  // Success: one window.open, NO fallback anchor, URL untouched, opener severed.
  const good = run(() => ({}));
  ok(good.result === true && good.windowOpens === 1 && good.anchorClicks === 0, "successful open: exactly one tab, no fallback anchor click");
  ok(good.openedUrl === MAPS, "directions URL (incl. query_place_id) reaches window.open unchanged");
  ok(good.lastHandle && good.lastHandle.opener === null, "opener severed on the opened handle");
  ok(good.features === undefined, "window.open is NOT called with noopener (its null return caused the duplicate)");

  // Blocked (null with no noopener in play): fallback fires exactly once.
  const blocked = run(() => null);
  ok(blocked.result === true && blocked.windowOpens === 1 && blocked.anchorClicks === 1, "blocked popup: exactly one fallback anchor click");
  ok(blocked.anchor.href === MAPS && blocked.anchor.target === "_blank", "fallback anchor carries the same directions URL in a new tab");

  // Throwing window.open: still exactly one fallback, never two opens.
  const threw = run(() => { throw new Error("blocked"); });
  ok(threw.result === true && threw.anchorClicks === 1, "throwing window.open: exactly one fallback anchor click");

  // Invalid URL: nothing opens at all.
  let invalidCalls = 0;
  ok(openExternal("javascript:alert(1)", () => { invalidCalls++; }) === false && invalidCalls === 1, "invalid URL opens nothing and reports via onInvalid");
}

if (failures) { console.error(`test-links: ${failures} failure(s)`); process.exit(1); }
console.log("test-links: OK — safeUrl rejects empty/junk/malformed/js/protocol-relative, accepts http(s)+internal; ticketHref is null on a bad URL so the control is hidden, never broken");
