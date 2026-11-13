"use client";
import { askShareIntent } from "../app/components/shareIntentSheet.js";
import { shareOut,canonicalSharePayload } from "./shareOut.js";

/** Only a concrete place path can imply place identity. Content IDs, event
 * IDs and collection/guide titles must never become a group-plan place. */
export function sharePlaceId(payload) {
  const p = payload || {};
  if (p.placeId) return String(p.placeId).trim();
  try {
    const path = new URL(p.url, "https://www.gowayfind.com").pathname;
    const match = path.match(/^\/(?:p|places)\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]).trim() : "";
  } catch { return ""; }
}

/** Same dark/orange intent menu for shell, cards, editorial and list buttons.
 * Callbacks run only from the subsequent choice's own gesture. */
export function openShareFlow(payload, onCopied, options = {}) {
  const directInvite = Boolean(payload?.directInvite || options?.directInvite);
  const raw = directInvite && payload && !payload.url
    ? {
        ...payload,
        url: payload.placeId
          ? "https://www.gowayfind.com/p/" + encodeURIComponent(String(payload.placeId).trim())
          : "https://www.gowayfind.com/ask",
      }
    : payload;
  const p = canonicalSharePayload(raw);
  if(!p)return "failed";
  if (!p.url || typeof document === "undefined") return "failed";
  const id = sharePlaceId(p);
  const groupId = typeof p.groupId === "string" ? p.groupId : "";
  const when = p.when || options.when || "";
  const eventDate = p.eventDate || options.eventDate || "";
  const surface = p.surface || options.surface || "";
  const geo = p.geo || options.geo || "";
  try {
    askShareIntent({
      name: p.title || p.name || "", city: p.city || "", id, groupId, kind: p.kind || "",
      when, eventDate, surface, geo, directInvite,
      onPlain: () => shareOut(p, onCopied, options),
      onInvite: (url, text) => shareOut({ title: "A question for you", url, text }, onCopied, options) !== "failed",
    });
    return "menu";
  } catch { return shareOut(p, onCopied, options); }
}

/**
 * 1-tap direct launcher for Plan Together (`Ask someone` / `Go together` / `Invite someone`).
 * Opens the invite step ("Who are you asking?") immediately with prefilled place/event/date/city/geo context.
 */
export function openDirectInvite(payload, onCopied, options = {}) {
  return openShareFlow({ ...(payload || {}), directInvite: true }, onCopied, { ...options, directInvite: true });
}
