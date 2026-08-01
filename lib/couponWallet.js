export const COUPON_WALLET_KEY = "wf_coupons";

export function readCouponWallet(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(COUPON_WALLET_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function clipCouponToWallet(coupon, storage, now = Date.now()) {
  if (!coupon || !coupon.id || !storage) return { wallet: readCouponWallet(storage), clipped: false };
  const wallet = readCouponWallet(storage);
  wallet[coupon.id] = { c: coupon, ts: Number(now) || Date.now() };
  try { storage.setItem(COUPON_WALLET_KEY, JSON.stringify(wallet)); } catch { return { wallet, clipped: false }; }
  return { wallet, clipped: true };
}
