/**
 * lib/ownerIdentity.js — SERVER-ONLY owner identity for Curator Boost.
 *
 * Do not import this from client components (app/home.js, Detail.js, kit).
 * The client never learns the founder email or UUID; it only renders
 * ownerPick from /api/signals/likes.
 *
 * Two doors, either one is enough so a missing WF_OWNER_USER_ID cannot
 * no-op the owner's like:
 *   1. process.env.WF_OWNER_USER_ID === likes.user_id
 *   2. signed-in / auth-user email matches the founder account
 *
 * Other emails and other UUIDs cannot mint ownerPick.
 */

export const OWNER_ACCOUNT_EMAIL = "gabrielpereira@me.com";

export function normalizeOwnerEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isOwnerEmail(email) {
  return normalizeOwnerEmail(email) === OWNER_ACCOUNT_EMAIL;
}

/**
 * Owner user-ids the like aggregate may treat as the founder.
 *
 * @param {string} envOwnerId WF_OWNER_USER_ID (may be empty)
 * @param {{id?: string, email?: string}|null} sessionUser verified /auth/v1/user
 * @param {Record<string, string>} emailByUserId auth emails keyed by user_id
 * @param {string[]} likeUserIds user_ids present on the like rows
 * @returns {string[]}
 */
export function ownerUserIds(envOwnerId, sessionUser, emailByUserId, likeUserIds) {
  const ids = new Set();
  const env = String(envOwnerId || "").trim();
  if (env) ids.add(env);
  if (sessionUser && sessionUser.id && isOwnerEmail(sessionUser.email)) {
    ids.add(String(sessionUser.id).trim());
  }
  const map = emailByUserId && typeof emailByUserId === "object" ? emailByUserId : {};
  for (const uid of likeUserIds || []) {
    if (!uid) continue;
    if (isOwnerEmail(map[uid])) ids.add(String(uid).trim());
  }
  return [...ids].filter(Boolean);
}
