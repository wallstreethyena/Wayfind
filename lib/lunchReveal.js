// Client-safe daily allowance for Lunch in My City. The cookie deliberately
// stores only a site-day and a reveal count: no place, location, or identity.
export const LUNCH_REVEAL_COOKIE = "wf_lunch_reveal_v1";

export function lunchRevealCount(cookieText, day) {
  const hit = String(cookieText || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${LUNCH_REVEAL_COOKIE}=`));
  if (!hit) return 0;
  try {
    const value = JSON.parse(decodeURIComponent(hit.slice(LUNCH_REVEAL_COOKIE.length + 1)));
    return value && value.day === day && Number.isInteger(value.count)
      ? Math.max(0, Math.min(2, value.count))
      : 0;
  } catch {
    return 0;
  }
}

export function lunchRevealLimit(signedIn) {
  return signedIn ? 2 : 1;
}

export function lunchRevealRemaining(cookieText, day, signedIn) {
  return Math.max(0, lunchRevealLimit(signedIn) - lunchRevealCount(cookieText, day));
}

export function lunchRevealCookieValue(day, count, secure = false) {
  const value = encodeURIComponent(JSON.stringify({ day, count: Math.max(0, Math.min(2, Number(count) || 0)) }));
  return `${LUNCH_REVEAL_COOKIE}=${value}; Max-Age=172800; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}
