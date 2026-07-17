// scripts/test-klook-coupons.mjs — locks the Klook partner coupons: real codes
// verbatim, every url on www.klook.com (their tracked domain) with the aid
// param, honest expiries, and the two-way-attribution invariants.
import { COUPONS } from "../lib/coupons.js";

let pass = 0;
const fail = (m) => { console.error("test-klook-coupons: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const klook = COUPONS.filter((c) => c.business === "Klook");
ok(klook.length >= 4, "the four harvested Klook codes are present — got " + klook.length);
const codes = klook.map((c) => c.code);
for (const want of ["S3USATT", "HOTELONAPP", "EUPTPUS5OFF", "EUMOBUS5OFF"]) {
  ok(codes.includes(want), want + " present verbatim (never invent a code)");
}
for (const c of klook) {
  ok(/^https:\/\/www\.klook\.com\//.test(c.url), c.id + ": url on www.klook.com (s.klook.com is untracked; never invent deep paths)");
  ok(/[?&]aid=\d+/.test(c.url), c.id + ": url carries the affiliate aid param (click attribution)");
  ok(typeof c.code === "string" && /^[A-Z0-9]+$/.test(c.code), c.id + ": code is a real uppercase code (code attribution)");
  ok(c.expires === null || /^\d{4}-\d{2}-\d{2}$/.test(c.expires), c.id + ": expiry is a real date or null (auto-hide contract)");
}
ok(klook.find((c) => c.code === "S3USATT").expires === "2026-08-02", "S3USATT expiry matches the dashboard (2026-08-02)");
console.log(`test-klook-coupons: OK — ${pass} assertions (verbatim codes, tracked urls, honest expiries)`);
