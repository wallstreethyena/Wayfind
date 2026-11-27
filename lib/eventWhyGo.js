// lib/eventWhyGo.js — the short "why go" blurb for an event page that has no
// hand-written why_go (owner, 2026-11-27: "short 'why go' blurbs on Christmas
// and event pages that also help Google search").
//
// THE CONTRACT
//   - Written ONCE per event from that event's OWN stored facts (wf_events row)
//     by the scheduled /api/cron/ai-why-go job, never on a page view.
//   - Stored in the shared server cache (wf_places_cache) and READ server side
//     by /florida-events/[slug], so the blurb is in the HTML Google crawls.
//   - The key carries a hash of the facts: when the listing changes, the old
//     blurb is no longer read and the next cron run writes a fresh one.
//   - A hand-written why_go always wins; this only fills the empty ones.
//   - Options, not orders (owner rule 2026-10-24): "a good pick if…",
//     never "you must" / "don't miss".
//   - Anti-invention checks (lib/openAiCopy.js): every number and every
//     capitalized name in the blurb must already be in the facts.
import { createHash } from "node:crypto";
import { cget, cset, DAY } from "./serverCache.js";
import { openAiCopy, hasBannedCopy, cleanLine, numbersGrounded, namesGrounded } from "./openAiCopy.js";

export const WHY_GO_CACHE_PREFIX = "aiwhy1|";
export const WHY_GO_TTL_MS = 400 * DAY; // an event's own copy; the facts hash retires it when the row changes

const str = (v, max = 240) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The facts the writer may use. PURE. Only stored row fields, nothing derived from a guess. */
export function whyGoEvidence(e) {
  if (!e || typeof e !== "object") return null;
  const name = str(e.event_name || e.short_title, 120);
  if (!name || !str(e.slug, 160)) return null;
  const tags = Array.isArray(e.tags) ? e.tags.map((t) => str(String(t), 30)).filter(Boolean).slice(0, 8) : [];
  const ev = {
    name,
    venue: str(e.venue, 120),
    city: str(e.city, 60),
    starts: str(e.start_date, 10),
    ends: str(e.end_date, 10),
    start_time: str(e.start_time, 8),
    schedule_note: str(e.schedule_note, 200),
    category: str(e.category, 40),
    subcategory: str(e.subcategory, 40),
    tags,
    audience: str(typeof e.audience === "string" ? e.audience : "", 40),
    free_entry: e.is_free === true ? true : undefined,
    price_band: str(e.price_band, 20),
    card_hook: str(e.card_hook, 240),
    summary: str(e.editorial_summary, 600),
    insider_tip: str(e.insider_tip, 240),
    fun_fact: str(e.fun_fact, 240),
    duration: str(e.duration_recommendation, 80),
  };
  for (const k of Object.keys(ev)) {
    if (ev[k] === "" || ev[k] === undefined || (Array.isArray(ev[k]) && !ev[k].length)) delete ev[k];
  }
  // Too thin to say anything true beyond the name: write nothing.
  if (!ev.card_hook && !ev.summary && !ev.insider_tip && !ev.fun_fact && !ev.category && !ev.tags) return null;
  return ev;
}

export function whyGoCacheKey(slug, evidence) {
  const h = createHash("sha256").update(JSON.stringify(evidence || {})).digest("hex").slice(0, 24);
  return WHY_GO_CACHE_PREFIX + String(slug || "").slice(0, 120) + "|" + h;
}

/** Accept or reject a model blurb. PURE. Returns the clean blurb or null. */
export function validateWhyGo(raw, evidence) {
  const text = cleanLine(raw, 340);
  if (!text || /^skip$/i.test(text)) return null;
  const words = text.split(/\s+/).length;
  if (words < 10 || words > 55) return null;
  const sentences = text.split(/(?<=[.?])\s+/).filter(Boolean);
  if (sentences.length > 2) return null;
  if (!/[.?]$/.test(text)) return null;
  if (/[!—–]|https?:|www\.|@|#/.test(text)) return null;
  if (hasBannedCopy(text)) return null;
  const evText = JSON.stringify(evidence || {});
  if (!numbersGrounded(text, evText)) return null;
  if (!namesGrounded(text, evText)) return null;
  return text;
}

const SYSTEM = [
  "You write ONE or TWO sentences (max 45 words) for Wayfind, a Florida things to do guide, saying why a specific event could be worth going to.",
  "Use ONLY the JSON facts given. Never invent performers, dishes, prices, times, crowd levels, history, awards, or anything not in the facts.",
  "Offer it as an option, not an order: say who it suits or what it gives them (for example 'A good pick for families who want…'). Never write must, don't miss, you need to, or exclamation points.",
  "Plain words, no hype, no dashes, no hashtags, no links, no emoji. Do not repeat the event name more than once. Do not start with the event name.",
  "Do not write any number, date, or time that is not exactly in the facts.",
  "If the facts are too thin for an honest blurb, return exactly SKIP.",
  "Return only the blurb text.",
].join(" ");

/** Generate, validate and store one blurb. Resolves { ok, text?, reason? }. */
export async function generateWhyGo(e) {
  const evidence = whyGoEvidence(e);
  if (!evidence) return { ok: false, reason: "thin_facts" };
  const key = whyGoCacheKey(e.slug, evidence);
  const hit = await cget(key).catch(() => null);
  if (hit && typeof hit.v === "string") return { ok: true, text: hit.v || null, cached: true };
  const res = await openAiCopy("why_go", { system: SYSTEM, user: JSON.stringify(evidence), json: false, temperature: 0.4 });
  if (!res.ok) return { ok: false, reason: res.reason };
  const text = validateWhyGo(res.text, evidence);
  // An honest blank is stored too, so a rejected listing is not re-billed every run.
  await cset(key, text || "", WHY_GO_TTL_MS).catch(() => {});
  return text ? { ok: true, text } : { ok: false, reason: "rejected", stored: true };
}

/** Page read: cache only, never a model call. Returns the blurb or null. */
export async function readWhyGo(e) {
  try {
    if (!e || str(e.why_go, 10)) return null; // hand-written copy wins
    const evidence = whyGoEvidence(e);
    if (!evidence) return null;
    const hit = await cget(whyGoCacheKey(e.slug, evidence));
    const text = hit && typeof hit.v === "string" ? validateWhyGo(hit.v, evidence) : null;
    return text || null;
  } catch {
    return null;
  }
}
