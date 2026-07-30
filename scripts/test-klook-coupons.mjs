// scripts/test-klook-coupons.mjs — locks the Klook partner coupons: real codes
// verbatim, every url on www.klook.com (their tracked domain) with the aid
// param, honest expiries, and the two-way-attribution invariants.
import { COUPONS } from "../lib/coupons.js";

let pass = 0;
const fail = (m) => { console.error("test-klook-coupons: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const klook = COUPONS.filter((c) => c.business === "Klook");
// ── TRANSLATED 2026-07-30: the owner's 2026-07-29 cut, landed in code ───────
// This suite used to REQUIRE all four harvested codes. The owner cut three of
// them as generic-travel offers that do not serve a local-discovery audience —
// but the cut only ever reached the registry, so both the data and this guard
// still carried the pre-cut state and the guard actively locked it there.
//
// The protection is unchanged and now runs in the other direction: the surviving
// code must still be verbatim (never invent a code), AND the cut three must stay
// gone. The second half is the stronger claim — it stops them drifting back in.
const codes = klook.map((c) => c.code);
ok(codes.includes("S3USATT"), "S3USATT present verbatim (never invent a code)");
for (const cut of ["HOTELONAPP", "EUPTPUS5OFF", "EUMOBUS5OFF"]) {
  ok(!codes.includes(cut),
    cut + " stays CUT — a generic-travel code (Europe rail, Europe mobility, app hotels) on a local-discovery deal sheet is the junk offer the page promises not to show");
}
ok(klook.length === 1, "exactly ONE Klook code survives the cut — got " + klook.length);
for (const c of klook) {
  ok(/^https:\/\/www\.klook\.com\//.test(c.url), c.id + ": url on www.klook.com (s.klook.com is untracked; never invent deep paths)");
  ok(/[?&]aid=\d+/.test(c.url), c.id + ": url carries the affiliate aid param (click attribution)");
  ok(typeof c.code === "string" && /^[A-Z0-9]+$/.test(c.code), c.id + ": code is a real uppercase code (code attribution)");
  ok(c.expires === null || /^\d{4}-\d{2}-\d{2}$/.test(c.expires), c.id + ": expiry is a real date or null (auto-hide contract)");
}
ok(klook.find((c) => c.code === "S3USATT").expires === "2026-08-02", "S3USATT expiry matches the dashboard (2026-08-02)");
console.log(`test-klook-coupons: OK — ${pass} assertions (verbatim codes, tracked urls, honest expiries)`);
