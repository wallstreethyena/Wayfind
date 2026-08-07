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
// ── TRANSLATED AGAIN 2026-08-07: S3USATT joined the cut ─────────────────────
// The code expired 2026-08-02, its robot fired 08-03, and the registry ruled
// PURGE (dead weight; auto-hidden since). Same one-way ratchet as the owner's
// 07-29 cut: the guard now asserts the ABSENCE, so an expired dashboard code
// cannot drift back in without a fresh harvest consciously rewriting this file.
for (const cut of ["S3USATT", "HOTELONAPP", "EUPTPUS5OFF", "EUMOBUS5OFF"]) {
  ok(!codes.includes(cut),
    cut + " stays CUT — a generic-travel code (Europe rail, Europe mobility, app hotels) on a local-discovery deal sheet is the junk offer the page promises not to show");
}
ok(klook.length === 0, "ZERO Klook code cards remain after the 08-07 purge — got " + klook.length);
for (const c of klook) {
  // 2026-08-02 — these REQUIRED the legacy ?aid= link. The owner's decision is
  // to run one Klook path, Travelpayouts (promoId 4110 / campaignId 137), which
  // is what PROVIDERS.klook and /api/commerce/go already use. So the aid form is
  // now forbidden rather than required, and the only permitted link is ours.
  ok(!/[?&]aid=\d+/.test(String(c.url || "")), c.id + ": no legacy ?aid= id — Klook attribution runs through Travelpayouts, and two mechanisms split the credit");
  ok(!c.url || String(c.url).startsWith("/api/commerce/go?"), c.id + ": any Klook link goes through our redirect (which wraps it with Travelpayouts), never a raw klook.com URL");
  ok(c.url === null || String(c.url).startsWith("/api/"), c.id + ": with no verifiable Klook landing page, the card ships its CODE and no button rather than an untracked link");
  ok(typeof c.code === "string" && /^[A-Z0-9]+$/.test(c.code), c.id + ": code is a real uppercase code (code attribution)");
  ok(c.expires === null || /^\d{4}-\d{2}-\d{2}$/.test(c.expires), c.id + ": expiry is a real date or null (auto-hide contract)");
}
console.log(`test-klook-coupons: OK — ${pass} assertions (verbatim codes, tracked urls, honest expiries)`);
