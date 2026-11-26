"use client";
import { shareOut,canonicalSharePayload } from "./shareOut.js";
import { concreteSharePlaceId, experienceGroupId } from "./shareContext.js";

/** Only a concrete place path can imply place identity. Content IDs, event
 * IDs and collection/guide titles must never become a group-plan place. */
export function sharePlaceId(payload) {
  const p = payload || {};
  const explicit = concreteSharePlaceId(p.placeId || p.place_id || "");
  if (explicit) return explicit;
  try {
    const path = new URL(p.url, "https://www.gowayfind.com").pathname;
    const match = path.match(/^\/(?:p|places)\/([^/]+)\/?$/);
    return match ? concreteSharePlaceId(decodeURIComponent(match[1]).trim()) : "";
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
  const groupId = typeof p.groupId === "string" && p.groupId.trim()
    ? p.groupId.trim()
    : (p.experienceCode ? experienceGroupId(String(p.experienceCode)) : "");
  const when = p.when || options.when || "";
  const eventDate = p.eventDate || options.eventDate || "";
  const surface = p.surface || options.surface || "";
  const geo = p.geo || options.geo || "";
  // The intent sheet (and the invite encoder behind it) is fetched on the tap,
  // not shipped with every page: it is interaction-only code, and as a static
  // import it rode into the homepage's first-load JS through every card's share
  // button (check-bundle, 2026-11-26). app/home.js already loaded it this way.
  // The sheet opening needs no user activation; each choice inside it is its
  // own tap. A failed chunk load still shares, through the plain transport.
  const plain = () => shareOut(p, onCopied, options);
  loadShareIntentSheet().then(({ askShareIntent }) => askShareIntent({
    name: p.title || p.name || "", city: p.city || "", id, groupId, kind: p.kind || "",
    when, eventDate, surface, geo, directInvite,
    onPlain: plain,
    onInvite: (url, text) => shareOut({ title: "A question for you", url, text }, onCopied, options) !== "failed",
  })).catch(plain);
  return "menu";
}

/** The one loader for the share intent sheet; callers may warm it early. */
export function loadShareIntentSheet() {
  return import("../app/components/shareIntentSheet.js");
}

/**
 * 1-tap direct launcher for Plan Together (`Ask someone` / `Go together` / `Invite someone`).
 * Opens the invite step ("Who are you asking?") immediately with prefilled place/event/date/city/geo context.
 */
export function openDirectInvite(payload, onCopied, options = {}) {
  return openShareFlow({ ...(payload || {}), directInvite: true }, onCopied, { ...options, directInvite: true });
}
