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
  const p = canonicalSharePayload(payload);
  if(!p)return "failed";
  if (!p.url || typeof document === "undefined") return "failed";
  const id = sharePlaceId(p);
  try {
    askShareIntent({
      name: p.title || "", city: p.city || "", id, kind: p.kind || "",
      onPlain: () => shareOut(p, onCopied, options),
      onInvite: (url, text) => shareOut({ title: "A question for you", url, text }, onCopied, options) !== "failed",
    });
    return "menu";
  } catch { return shareOut(p, onCopied, options); }
}
