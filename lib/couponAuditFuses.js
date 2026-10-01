// SERVER-ONLY (imported by lib/commandCenter/alertsRun.js and guards; never by app/ client code).
// The Clipp owner-audit fuses, listed for the Command Center `coupon_audit_*` alert so a lapse is
// announced instead of failing a build. Kept out of lib/coupons.js on purpose: that module is
// reachable from the client bundle, and these labels are dead weight there (check-bundle ratchet).
import { CLIPP_AUDIT_EXPIRY, CLIPP_MERCHANT_AUDIT_EXPIRY } from "./coupons.js";

export const COUPON_AUDIT_FUSES = Object.freeze([
  Object.freeze({ id: "clipp_city_pages", label: "Clipp city-page cards (Sarasota, Bradenton, Tampa, Orlando)", expires: CLIPP_AUDIT_EXPIRY }),
  Object.freeze({ id: "clipp_merchant_cards", label: "Clipp merchant certificate cards", expires: CLIPP_MERCHANT_AUDIT_EXPIRY }),
]);
