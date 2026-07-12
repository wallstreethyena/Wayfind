// v5.77 prebuild gate — the outbound-link validator (lib/links.js). This is the
// regression net for the "Safari can't open the page" / "Get tickets -> Expedia"
// class: safeUrl must reject anything that can't be a real destination (so it
// never reaches an href), ticketHref must yield null for a missing/bad ticket
// URL (so the caller HIDES the button instead of rendering a wrong or broken
// one), and both must be pure — no window, no fetch.
import { safeUrl, isSafeUrl, ticketHref } from "../lib/links.js";

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
  ok(typeof h === "string" && h.indexOf("https://www.ticketmaster.com/e/1") === 0, "a real ticket url passes through (affiliate-wrapped)");
}
ok(ticketHref({ ticketUrl: "https://frrm.org/ride" }) != null, "reads the ticketUrl field too");

if (failures) { console.error(`test-links: ${failures} failure(s)`); process.exit(1); }
console.log("test-links: OK — safeUrl rejects empty/junk/malformed/js/protocol-relative, accepts http(s)+internal; ticketHref is null on a bad URL so the control is hidden, never broken");
