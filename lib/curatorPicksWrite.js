"use client";
// lib/curatorPicksWrite.js — the like-write half of lib/curatorPicks.js,
// loaded on the first tap rather than with the homepage (the read/apply core
// stays eager; this path is only needed once someone presses Like).
import { beginCuratorToggle, settleCuratorToggle, noteSessionOwner } from "./curatorPicks.js";

/** Read the server's FRESH verdict for one place. null = could not ask. */
export async function fetchCuratorVerdict(id, getHeaders) {
  try {
    const headers = typeof getHeaders === "function" ? await getHeaders() : undefined;
    const r = await fetch("/api/signals/likes?ids=" + encodeURIComponent(id) + "&fresh=1", headers ? { headers } : undefined);
    return curatorVerdictFromLikes(r.ok ? await r.json() : null, id);
  } catch (e) { return "unknown"; }
}

/** Parse a likes-route body into "on" | "off" | "unknown". */
export function curatorVerdictFromLikes(body, id) {
  if (!body || typeof body !== "object" || !body.counts || typeof body.counts !== "object") return "unknown";
  if (body.sessionOwner === true) noteSessionOwner(true);
  return body.owner && typeof body.owner === "object" && body.owner[id] ? "on" : "off";
}

/**
 * The whole like lifecycle for any surface: sequence, write, then reconcile
 * with the server on success AND failure (supabase resolves {error} rather
 * than rejecting). `write` is the like/unlike promise. Returns the seq.
 */
export function trackCuratorWrite(id, on, write, getHeaders, prior, takenSeq) {
  if (id == null) return 0;
  // A caller that already showed the optimistic pick (beginCuratorToggle in
  // the same turn as the tap) hands its sequence number in.
  const seq = takenSeq != null ? takenSeq : beginCuratorToggle(id, on);
  const settle = async (ok) => {
    const verdict = await fetchCuratorVerdict(id, getHeaders);
    settleCuratorToggle(id, seq, verdict, ok ? !!on : !!prior);
  };
  Promise.resolve(write).then((res) => settle(!(res && res.error)), () => settle(false));
  return seq;
}

