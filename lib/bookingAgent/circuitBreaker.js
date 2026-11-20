// One challenge pauses the site for 24 hours. Three challenges inside 7 days disable it.
// The caller saves the returned row. This function does not talk to a database.

const DAY = 24 * 60 * 60 * 1000;

export function applyChallenge(siteRow, now = Date.now()) {
  const row = siteRow || { status: "on", challenge_count_7d: 0, last_challenge_at: null };
  const last = row.last_challenge_at ? Date.parse(row.last_challenge_at) : NaN;
  const fresh = !Number.isFinite(last) || now - last > 7 * DAY;
  const count = (fresh ? 0 : (row.challenge_count_7d | 0)) + 1;
  const disabled = row.status === "disabled" || count >= 3;
  return {
    status: disabled ? "disabled" : "paused",
    paused_until: new Date(now + DAY).toISOString(),
    last_challenge_at: new Date(now).toISOString(),
    challenge_count_7d: count,
  };
}
