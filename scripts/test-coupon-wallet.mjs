#!/usr/bin/env node
// The Coupons tab is a clip-first wallet: compact vertical cards, explicit save
// state, a registered/live-only clipped view, and no horizontal page expansion.
import { readFileSync } from "node:fs";
import path from "node:path";
import { clipCouponToWallet, readCouponWallet } from "../lib/couponWallet.js";

const src = readFileSync(path.resolve("app/components/screens/Coupons.js"), "utf8");
let pass = 0;
const fail = [];
const ok = (value, message) => { if (value) pass++; else fail.push(message); };

ok(/Clip it now\.<br \/>Find it later\./.test(src), "the page explains the clip-and-return job in the header");
ok(src.includes('"✓ Clipped" : "+ Clip"'), "every deal exposes explicit Clip and Clipped states");
ok(/aria-label="Tap to open your wallet"/.test(src), "the clipped wallet is a named, accessible top-level view");
ok(/setWalletOpen\(true\)/.test(src) && /setWalletOpen\(false\)/.test(src), "both All deals and Clipped views are reachable");
ok(/registered = new Map\(all\.map/.test(src), "the clipped view resolves through the registered inventory map");
ok(/registered\.get\(id\)/.test(src) && /couponIsLive\(c, today\)/.test(src), "an unknown or expired saved payload cannot reappear as a usable coupon");
ok(/sort\(\(a, b\).*\.ts/.test(src), "clipped deals are newest-first so the last thing saved is easiest to recover");
ok(/borderLeft: `4px solid/.test(src), "cards use a compact ticket edge instead of an image column");
ok(/display: "grid", gap: 10/.test(src), "the deal feed is vertical, not a horizontal poster rail");
ok(!/flex: "0 0 316px"|scrollSnapType: "x mandatory"|overflowX: "auto"/.test(src), "the fixed poster carousel cannot widen the mobile page");
ok(/overflowX: "clip"/.test(src) && /maxWidth: "100%"/.test(src), "the screen explicitly contains horizontal overflow");
ok(!/next\/image|<Image\b|<img\b|CouponThumb|dealArtwork\(/.test(src), "the wallet has no image pipeline or photo slot to crop, break or mismatch");
ok(/seal\.big/.test(src) && /seal\.small/.test(src), "the verified savings value, not a generic photo, is the card's visual anchor");
ok((src.match(/<a\b/g) || []).length === 1, "one coupon card has exactly one redeem anchor");
ok(/rel="noreferrer sponsored nofollow"/.test(src), "the redeem anchor keeps affiliate link semantics");
ok(/PARTNER/.test(src) && /commissions never change your price or Wayfind rankings/.test(src), "affiliate inventory is labeled without overwhelming the clip action");

const memory = new Map();
const storage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
const deal = { id: "deal_test", business: "Test", title: "Useful offer" };
const clippedResult = clipCouponToWallet(deal, storage, 1234);
ok(clippedResult.clipped, "a deal can be clipped before leaving an intent sheet");
ok(readCouponWallet(storage).deal_test?.c?.title === "Useful offer", "the wallet preserves the exact registered deal payload");
ok(readCouponWallet(storage).deal_test?.ts === 1234, "the pre-navigation clip preserves newest-first wallet ordering");

const strip = readFileSync(path.resolve("app/components/ExperienceBlocks.js"), "utf8");
const intent = readFileSync(path.resolve("app/components/IntentPageClient.js"), "utf8");
const home = readFileSync(path.resolve("app/home.js"), "utf8");
ok(/clipCouponToWallet\(coupon, window\.localStorage\)/.test(strip), "intent deal rows clip the exact coupon before navigation");
ok(/\/coupons\?view=clipped/.test(intent), "intent deal rows navigate directly to the clipped wallet");
ok(/go === "coupons" && sp\.get\("view"\) === "clipped"/.test(home), "the app handoff opens the clipped wallet view");

if (fail.length) {
  console.error("test-coupon-wallet: FAIL");
  fail.forEach((message) => console.error("  - " + message));
  process.exit(1);
}
console.log(`test-coupon-wallet: OK — ${pass} assertions (compact cards, explicit clip state, registered wallet, mobile overflow contained)`);
