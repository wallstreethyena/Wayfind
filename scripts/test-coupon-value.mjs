#!/usr/bin/env node
// scripts/test-coupon-value.mjs — behaviour lock for lib/couponValue.js.
// Every assertion CALLS the parser. The three consuming surfaces (coupon
// card, share text, /api/og coupon card) all derive from this one function,
// so these numbers being right IS the honesty of all three.
import { strict as assert } from "node:assert";
import { parseCouponValue } from "../lib/couponValue.js";

let n = 0;
const t = (name, fn) => { fn(); n++; process.stdout.write("  ok  " + name + "\n"); };

t("the standard certificate shape parses with whole-dollar labels", () => {
  const v = parseCouponValue("$10 for $20 of coffee & more");
  assert.deepEqual([v.pay, v.get, v.save, v.pct, v.what], [10, 20, 10, 50, "coffee & more"]);
  assert.equal(v.payLabel, "$10"); assert.equal(v.getLabel, "$20"); assert.equal(v.saveLabel, "$10");
});
t("cents survive and the percent rounds honestly (the 65% poke deal)", () => {
  const v = parseCouponValue("$10.50 for $30 of poke bowls & more");
  assert.equal(v.pct, 65); assert.equal(v.saveLabel, "$19.50"); assert.equal(v.payLabel, "$10.50");
});
t("a certificate without an 'of …' tail still parses", () => {
  const v = parseCouponValue("$20 for $40");
  assert.equal(v.what, null); assert.equal(v.pct, 50);
});
t("non-certificate titles return null — the card keeps its original title", () => {
  for (const s of ["Free Mondays (Museum of Art)", "Five Tampa Bay attractions, up to 55% off", "Taco Tuesday", "", null]) {
    assert.equal(parseCouponValue(s), null, JSON.stringify(s));
  }
});
t("pay >= get is never rendered as a deal", () => {
  assert.equal(parseCouponValue("$20 for $20 of dining"), null);
  assert.equal(parseCouponValue("$30 for $20 of dining"), null);
});
t("the match stays anchored — a prefix cannot sneak a parse", () => {
  // The 'of …' tail legitimately absorbs free text (titles come from OUR
  // verified registry, never user input); what must hold is the ^ anchor:
  assert.equal(parseCouponValue("Deal: $10 for $20 of dining"), null);
});

console.log("\ntest-coupon-value: OK — " + n + " behaviour tests, all by CALLING the parser");
