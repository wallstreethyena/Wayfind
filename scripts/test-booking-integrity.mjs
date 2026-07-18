// scripts/test-booking-integrity.mjs — locks the booking-integrity hotfix (v2).
// The "Tickets & tours" links were sending people to the wrong place (Dalí ->
// Barcelona, Ringling -> Houston) because geo was a no-op + a Florida-only
// blacklist. Now: generic words are never identity, geography is a POSITIVE
// whitelist and a HARD gate (missing region fails CLOSED), and near-ties resolve
// to no-guess. These fixtures prove wrong-place products are rejected and the
// right LOCAL product is kept. Plus isolation checks: affiliate never touches
// Score/placement, and only the sanctioned module builds the /go URL.
import { resolveVerified } from "../lib/bookingResolver.js";
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, relative } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("test-booking-integrity: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const place = (name, id) => ({ id, name });
const prod = (title, code) => ({ title, productUrl: `https://www.viator.com/tours/${code}`, productCode: code });
const R = (region, kind) => ({ region, kind });

// ── WRONG-PLACE products must be rejected (null) ──────────────────────────────
ok(resolveVerified(place("The Dalí Museum", "dali"), [prod("Barcelona: Dalí Theatre-Museum Skip-the-Line", "BCN1")], R("St. Petersburg", "museum")) === null,
  "Dalí (St. Petersburg) rejects a Barcelona Dalí product");
ok(resolveVerified(place("The Ringling", "ring"), [prod("Houston Museum of Fine Arts Admission", "HOU1")], R("Sarasota", "museum")) === null,
  "Ringling (Sarasota) rejects Houston MFA");
ok(resolveVerified(place("The Bishop Museum of Science and Nature", "bish"), [prod("Houston Museum of Natural Science Tickets", "HOU2")], R("Bradenton", "museum")) === null,
  "Bishop (Bradenton) rejects Houston Museum of Natural Science (GENERIC kills science/nature/museum credit)");
ok(resolveVerified(place("Bradenton Riverwalk", "brw"), [prod("San Antonio River Walk Cruise", "SAT1")], R("Bradenton", "waterfront")) === null,
  "Bradenton Riverwalk rejects San Antonio River Walk");

// ── The RIGHT local product is KEPT (non-null, correct code) ───────────────────
const robinson = resolveVerified(place("Robinson Preserve", "rob"), [prod("Robinson Preserve Kayak Eco Tour in Bradenton", "ROB1")], R("Bradenton", "waterfront"));
ok(robinson && robinson.productCode === "ROB1", "Robinson Preserve (Bradenton) KEEPS its Bradenton kayak (correct product)");

// ── Fail-closed + no-guess ────────────────────────────────────────────────────
ok(resolveVerified(place("Robinson Preserve", "rob"), [prod("Robinson Preserve Kayak Eco Tour in Bradenton", "ROB1")], R("", "waterfront")) === null,
  "blank region -> null (geography fails CLOSED)");
ok(resolveVerified(place("The Museum", "gen"), [prod("Sarasota Museum Guided Tour", "SRQ1")], R("Sarasota", "museum")) === null,
  "generic-only place name -> null (no distinctive token to prove identity)");
// changing ONLY the region flips the result (Bradenton keeps, Orlando rejects the same product)
ok(resolveVerified(place("Robinson Preserve", "rob"), [prod("Robinson Preserve Kayak Eco Tour in Bradenton", "ROB1")], R("Orlando", "waterfront")) === null,
  "same place+product, region Orlando -> null: the geo gate is what decides, not the name");

// ── Isolation: affiliate/booking never touches Score or placement ─────────────
for (const f of ["lib/score.js", "lib/ranking.js"]) {
  const src = readFileSync(join(ROOT, f), "utf8");
  ok(!/verifiedOffers|bookingResolver|experiencesData|experiencesServe|experiencesEngine/.test(src), `${f} must NOT import verifiedOffers/bookingResolver/experiences* (affiliate must never reach Score/placement)`);
}

// ── Isolation: only lib/affiliates.js builds the /go URL; no UI hand-rolls a product URL ──
const GO_OK = new Set(["lib/affiliates.js"]);                                  // the ONE /go-URL builder
const PRODUCT_OK = new Set(["lib/affiliates.js", "lib/bookingResolver.js", "lib/viatorServer.js", "lib/guides.js", "lib/coupons.js"]); // resolver + curated editorial data
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" ? [] : walk(p);
  return /\.(js|jsx|mjs)$/.test(n) ? [p] : [];
});
// Strip full-line comments so a doc line mentioning the URL isn't read as construction.
const codeOnly = (src) => src.split("\n").filter((l) => { const t = l.trimStart(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); }).join("\n");
for (const abs of [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))]) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  if (rel.startsWith("app/api/viator/")) continue; // the route receives /go, doesn't build the URL string
  const src = codeOnly(readFileSync(abs, "utf8"));
  if (/\/api\/viator\/go\?/.test(src)) ok(GO_OK.has(rel), `${rel} builds /api/viator/go directly — route it through lib/affiliates.js experienceGoUrl`);
  if (/viator\.com\/tours\//.test(src)) ok(PRODUCT_OK.has(rel), `${rel} hand-builds a viator.com product URL — must come from the resolver / affiliates (or be curated data)`);
}

console.log(`test-booking-integrity: OK — ${pass} assertions (wrong-place rejected; local kept; fail-closed; affiliate isolated from Score + /go)`);
