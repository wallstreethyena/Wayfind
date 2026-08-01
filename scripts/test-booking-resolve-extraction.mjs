// scripts/test-booking-resolve-extraction.mjs — the extraction changed NOTHING.
//
// bookingTargets()/hasBookingCTA() moved out of app/components/BookingCTA.js (a
// "use client" component) and down into lib/bookingResolve.js, so the SERVER-side
// guide pages can use the same predicate instead of calling Aff.experienceGoUrl()
// per pick — which is the parallel resolution path the booking-integrity contract
// forbids, and how an earning link once rendered with no FTC disclosure.
//
// This is a live commerce component, so the extraction is held to the #464
// standard: prove the resolved output is byte-identical before and after, across
// every branch, and prove the disclosure still travels with the CTA in BOTH
// callers.
import { readFileSync } from "fs";
import { bookingTargets, hasBookingCTA, BOOKABLE_KINDS } from "../lib/bookingResolve.js";

let pass = 0;
const fail = (m) => { console.error("test-booking-resolve-extraction: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// ── the resolver is SERVER-SAFE ───────────────────────────────────────────
// The whole point of moving it. A "use client" directive or a React import here
// and the guide page 500s the way /eat/[metro]/[cuisine] did.
{
  const src = read("lib/bookingResolve.js");
  ok(!/^["']use client["']/m.test(src), 'lib/bookingResolve.js has NO "use client" — it must import cleanly into a server component');
  ok(!/from ["']react["']|require\(["']react/.test(src), "it imports no React");
  ok(!/\bwindow\b|\bdocument\b|localStorage/.test(src.replace(/\/\/[^\n]*/g, "")), "it touches no browser globals");
  ok(/from "\.\/affiliates(\.js)?"/.test(src), "it imports only lib/affiliates, which is already server-safe");
  ok(/from "\.\/affiliates\.js"/.test(src),
    "...with an explicit .js extension, so plain-node guards can import it (lib/google.js's extensionless imports are why several guards must read source as text instead)");
}

// ── ONE predicate, TWO callers — not a second path ─────────────────────────
{
  const cta = read("app/components/BookingCTA.js");
  ok(/from "\.\.\/\.\.\/lib\/bookingResolve"/.test(cta), "BookingCTA imports the resolver rather than defining it");
  ok(!/^function bookingTargets\(/m.test(cta), "BookingCTA no longer defines bookingTargets — one definition only");
  ok(!/^const BOOKABLE_KINDS =/m.test(cta), "BOOKABLE_KINDS lives in one place");
  ok(/export \{ hasBookingCTA \}/.test(cta), "hasBookingCTA is re-exported so app/components/sheets/Detail.js keeps working untouched");
  const guide = read("app/guides/[slug]/page.js");
  ok(/from "\.\.\/\.\.\/\.\.\/lib\/bookingResolve"/.test(guide), "the guide page resolves through the SAME module");
  // The parallel path this whole refactor removes.
  const guideCode = guide.replace(/\/\*[\s\S]*?\*\//g, " ").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  ok(!/experienceGoUrl\(/.test(guideCode),
    "the guide page no longer calls experienceGoUrl() directly — that was the parallel resolution path");
  ok(!/hotelSearchUrl\(/.test(guideCode), "...nor hotelSearchUrl() directly");
}

// ── BYTE-IDENTICAL across every branch ────────────────────────────────────
// The four outcomes bookingTargets can produce, with real shapes.
const D = (o) => ({ id: "ChIJx", name: "Test Place", address: "1 Main St, Orlando, FL", ...o });
const VT = (id, items) => ({ [id]: { loading: false, items } });
const CASES = [
  // [label, detail, kind, viaTours, locName]
  ["verified Viator product", D({ types: ["museum", "tourist_attraction"] }), "museum",
    VT("ChIJx", [{ url: "https://www.viator.com/tours/Orlando/x/d123-456" }]), "Orlando, FL"],
  ["bookable kind, no product -> tracked search", D({ types: ["museum", "tourist_attraction"] }), "museum", null, "Orlando, FL"],
  ["BEACH is never bookable (the Coquina->Mumbai bug)", D({ types: ["beach", "natural_feature", "tourist_attraction"], category: "beach" }), "beach", null, "Sarasota, FL"],
  ["hotel -> Stay22", D({ types: ["lodging", "hotel"] }), "hotels", null, "Orlando, FL"],
  ["restaurant -> nothing monetized", D({ types: ["restaurant", "food"] }), "food", null, "Tampa, FL"],
  ["no address falls back to locName", D({ address: "", types: ["museum", "tourist_attraction"] }), "museum", null, "Orlando, FL"],
];
// The pre-extraction implementation, transcribed from git history, run side by
// side. If these ever disagree the extraction changed behaviour.
const BEFORE_KINDS = ["museum", "wildlife", "entertainment", "scenic", "beach", "nature", "landmark", "waterfront"];
const Aff = await import("../lib/affiliates.js");
function bookingTargetsBefore(detail, kind, topItem, locName) {
  const bcity = (() => { try { const parts = String(detail.address || "").split(",").map((x) => x.trim()); return parts.length >= 3 ? parts[1] : (locName ? locName.split(",")[0] : ""); } catch (e) { return ""; } })();
  const verifiedUrl = (topItem && Aff.ticketsUrl(detail)) ? (Aff.viatorDirectUrl(topItem.url) || topItem.url) : null;
  const goFallback = (!verifiedUrl && BEFORE_KINDS.includes(kind) && Aff.isTicketyPlace(detail)) ? Aff.experienceGoUrl(detail.name, bcity, kind, detail.id) : null;
  const tk = verifiedUrl || goFallback;
  const tu = tk || Aff.hotelUrl(detail);
  return { verifiedUrl, goFallback, tk, tu };
}
let branchesExercised = 0;
for (const [label, detail, kind, viaTours, locName] of CASES) {
  const hasTours = !!(viaTours && viaTours[detail.id] && viaTours[detail.id].items && viaTours[detail.id].items.length);
  const topItem = hasTours ? viaTours[detail.id].items[0] : null;
  // v6.76: the relevance gate deliberately CHANGES output when evidence is
  // absent, so this fidelity comparison runs with the gate OPEN. That keeps the
  // question this loop asks unchanged — "did moving the code out of the client
  // component alter its behaviour?" — and leaves the gate itself to be tested on
  // its own terms below. Comparing with the gate CLOSED would conflate two
  // different changes and tell us nothing about either.
  const gateOpen = { placeEvidence: { resolved: true, verifiedCount: 1 } };
  const afterFull = bookingTargets(detail, kind, topItem, locName, gateOpen);
  // Only the four keys the pre-extraction implementation returned.
  const after = { verifiedUrl: afterFull.verifiedUrl, goFallback: afterFull.goFallback, tk: afterFull.tk, tu: afterFull.tu };
  const before = bookingTargetsBefore(detail, kind, topItem, locName);
  ok(JSON.stringify(after) === JSON.stringify(before),
    `${label}: BYTE-IDENTICAL before/after (gate open)\n      before ${JSON.stringify(before)}\n      after  ${JSON.stringify(after)}`);
  if (after.tu) branchesExercised++;
}
// Both outcomes must occur, or "identical" is a claim about one branch.
ok(branchesExercised >= 3, `at least 3 cases resolved a monetized target (got ${branchesExercised})`);
ok(CASES.length - branchesExercised >= 1, "at least one case resolved NOTHING — the null branch is exercised too");
ok(BOOKABLE_KINDS.join(",") === BEFORE_KINDS.join(","), "BOOKABLE_KINDS is unchanged, in order");

// The beach gate is the one that shipped a real bug; assert it directly.
{
  const beach = D({ types: ["beach", "natural_feature", "tourist_attraction"], category: "beach" });
  ok(bookingTargets(beach, "beach", null, "Sarasota, FL").goFallback === null,
    "a BEACH gets no Viator fallback — this is the Coquina->Mumbai bug and it must stay dead");
}
// hasBookingCTA returns a BOOLEAN, never a URL — so it cannot become a second
// way to construct a booking href.
{
  const v = hasBookingCTA(D({ types: ["museum", "tourist_attraction"] }), "museum", null, "Orlando, FL");
  ok(typeof v === "boolean", `hasBookingCTA returns a boolean (got ${typeof v})`);
  ok(hasBookingCTA(null, "museum", null, "x") === false, "null detail -> false, no throw");
}

// ── the FTC disclosure travels with the CTA in BOTH callers ───────────────
{
  const cta = read("app/components/BookingCTA.js");
  ok(/commission|disclosure/i.test(cta), "the client caller still carries its commission disclosure");
  const guide = read("app/guides/[slug]/page.js");
  ok(/may earn a commission/i.test(guide), "the guide caller carries the commission disclosure");
  // The CTA itself renders in the client conversion block, so that is where the
  // sponsored rel and the click instrumentation live.
  const conv = read("app/guides/[slug]/GuideConversion.js");
  ok(/rel: "noreferrer sponsored"/.test(conv),
    "the guide's monetized CTA carries rel=noreferrer sponsored");
  ok(/cta\.sponsored \? \{ target/.test(conv),
    "...and only when the resolver marked it sponsored, so a non-monetized Directions link is not falsely tagged");
}

// ── THE RELEVANCE GATE (v6.76, owner's Ringling tap) ────────────────────────
// The generic tracked search may only render as PRIMARY when Viator provably
// holds inventory for THIS place. A search that opens irrelevant results spends
// trust we need for the next click.
{
  const museum = D({ types: ["museum", "tourist_attraction"] });
  const perm = (opts) => bookingTargets(museum, "museum", null, "Orlando, FL", opts);

  // SCOPE. A caller that does not participate in the evidence protocol is
  // UNCHANGED. Default-deny was tried first and check-guide-conversion caught it
  // cutting the guide pages' monetized CTAs from 5+ to 1 — guides render on the
  // server with no per-place Viator fetch, so they have no evidence to pass.
  const none = perm(undefined);
  ok(typeof none.goFallback === "string" && none.goFallback.length > 0,
    "a caller passing NO evidence is unchanged — the gate scopes to participants, so it cannot cut another surface's revenue");
  ok(none.fallbackSuppressed === null, "a non-participating caller reports no suppression");

  // Fetch in flight -> suppress rather than flash a CTA we may retract.
  const pending = perm({ placeEvidence: { resolved: false, verifiedCount: 0 } });
  ok(pending.goFallback === null, "evidence pending -> no fallback yet");
  ok(pending.fallbackSuppressed === "evidence_pending", `reason is evidence_pending (got ${pending.fallbackSuppressed})`);

  // THE RINGLING CASE: resolved, and Viator has nothing for this place.
  const empty = perm({ placeEvidence: { resolved: true, verifiedCount: 0 } });
  ok(empty.goFallback === null, "resolved with zero verified products -> no fallback (the Ringling case)");
  ok(empty.fallbackSuppressed === "no_verified_products", `reason is no_verified_products (got ${empty.fallbackSuppressed})`);

  // Evidence present -> the fallback is allowed through, unchanged.
  const okEv = perm({ placeEvidence: { resolved: true, verifiedCount: 2 } });
  ok(typeof okEv.goFallback === "string" && okEv.goFallback.length > 0, "with verified inventory the fallback still renders");
  ok(okEv.fallbackSuppressed === null, "nothing was withheld, so there is no suppression reason");

  // A reason must never accompany a rendered fallback, or the event lies.
  ok(!(okEv.goFallback && okEv.fallbackSuppressed), "goFallback and fallbackSuppressed are mutually exclusive");

  // The gate must not resurrect a non-permitted case: a beach with evidence is
  // still never bookable (the Coquina->Mumbai invariant).
  const beach2 = D({ types: ["beach", "natural_feature", "tourist_attraction"], category: "beach" });
  const beachEv = bookingTargets(beach2, "beach", null, "Sarasota, FL", { placeEvidence: { resolved: true, verifiedCount: 5 } });
  ok(beachEv.goFallback === null, "a BEACH with verified inventory is STILL not bookable — the gate narrows, it never widens");
  ok(beachEv.fallbackSuppressed === null, "a non-permitted place reports no suppression — it was never a candidate");

  // ANTI-DRIFT: because the gate is opt-in, the detail sheet must be PROVEN to
  // opt in. Without this, BookingCTA could drop the argument and silently return
  // to serving irrelevant Viator searches as its primary CTA.
  const cta = readFileSync(new URL("../app/components/BookingCTA.js", import.meta.url), "utf8");
  ok(/bookingTargets\([^)]*placeEvidence:\s*placeEvidence\(/.test(cta.replace(/\n/g, " ")),
    "BookingCTA passes placeEvidence into bookingTargets — the sheet participates in the relevance gate");
  ok(/fallback_suppressed/.test(cta), "BookingCTA still instruments fallback_suppressed — the gate's measurement is the point");

  // hasBookingCTA must agree with the primary variant, or the dock sizes a
  // two-column grid for a button that does not render (the v6.44 bug).
  const vtEmpty = { [museum.id]: { loading: false, items: [] } };
  ok(hasBookingCTA(museum, "museum", vtEmpty, "Orlando, FL") === false,
    "hasBookingCTA returns FALSE when the gate suppresses — layout and button read one predicate");
}

console.log(`test-booking-resolve-extraction: OK — ${pass} assertions (server-safe, one definition, byte-identical across ${CASES.length} branches, beach gate intact, disclosure in both callers)`);
