// Optional Santa AI co-pilot for Group Vote (never forced).
// Grounding law: Santa ONLY picks from Wayfind's real, server-verified
// inventory candidates (places + matching experiences). All Anthropic calls
// route through lib/paidAi.js (shared ledger + billing circuit breaker),
// with an instant deterministic fallback so the button always works cleanly.
import { aiKey } from "./aiKey.js";
import { paidAnthropicRequest } from "./paidAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "./providerHealth.js";
import { UNDERSTAND_MODEL } from "./searchUnderstand.js";
import { stripBoDashes } from "./boHauntChat.js";
import { groupShareMessage } from "./groupPlanShareText.js";

export { groupShareMessage };

const CLEAN = (s, max = 220) => stripBoDashes(String(s || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, max);

/** Instant deterministic lineup when AI is skipped, rate-limited, or unconfigured. */
export function deterministicSantaLineup({ seed, places = [], experiences = [] }) {
  const picked = [];
  if (seed?.id) picked.push(seed.id);
  for (const p of (places || []).slice(0, 2)) {
    if (p?.id && !picked.includes(p.id)) picked.push(p.id);
  }
  if (experiences?.length && picked.length < 4) {
    const exp = experiences[0];
    if (exp?.id && !picked.includes(exp.id)) picked.push(exp.id);
  }
  const hasExp = picked.some((id) => String(id).startsWith("vx_"));
  const seedName = CLEAN(seed?.name || "your pick", 60);
  const note = picked.length > 1
    ? (hasExp
        ? `Ho ho, I paired ${seedName} with top nearby spots and a matching experience so your crew has a real choice.`
        : `Ho ho, I matched ${seedName} with the strongest nearby spots that share the vibe. Tweak anything you like.`)
    : `Ho ho, ${seedName} already tops my nice list here. Add any other spot from search if you want a faceoff.`;
  return { selectedIds: picked.slice(0, 4), note, source: "fallback" };
}

export function parseSantaCurate(text, allowedIds, seedId) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let json;
  try { json = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const valid = new Set(allowedIds);
  const ids = [];
  if (seedId && valid.has(seedId) && json.keepOriginal !== false) ids.push(seedId);
  for (const rawId of Array.isArray(json.selectedIds) ? json.selectedIds : []) {
    const id = String(rawId || "").trim();
    if (valid.has(id) && !ids.includes(id) && ids.length < 4) ids.push(id);
  }
  const note = CLEAN(json.note, 200);
  if (!ids.length || !note) return null;
  return { selectedIds: ids, note };
}

/**
 * Grounded Santa AI shortlist selection for Group Vote.
 * Always returns valid IDs from Wayfind's real candidates, falling back
 * deterministically if Claude is unavailable.
 */
export async function santaCurateShortlist({ seed, places = [], experiences = [], env = process.env, fetchImpl = fetch } = {}) {
  const fallback = () => deterministicSantaLineup({ seed, places, experiences });
  const pool = [...(places || []), ...(experiences || [])];
  if (!seed?.id || !pool.length) return fallback();

  const key = env === process.env ? aiKey() : String(env.ANTHROPIC_API_KEY || env.LLM_API_KEY || "").trim();
  if (!key) return fallback();
  try { if (await breakerOpen("anthropic")) return fallback(); } catch { return fallback(); }

  const allowedIds = [seed.id, ...pool.map((x) => x.id)];
  const rows = [
    `SEED | ${seed.id} | ${seed.kind || "place"} | ${CLEAN(seed.name, 70)} | ${seed.category || ""} | ${seed.city || ""} | score:${seed.score ?? "?"}`,
    ...pool.slice(0, 8).map((c) =>
      `CAND | ${c.id} | ${c.kind || "place"} | ${CLEAN(c.name, 70)} | ${c.category || ""} | ${(c.matchReasons || []).join(", ")}`
    ),
  ].join("\n");

  const system = [
    "You are Santa, Wayfind's warm, witty Florida holiday host helping an organizer build a fun Group Vote ballot.",
    "Pick 2 to 3 candidates from the CAND rows to pair with SEED (3 to 4 total including SEED). Include 1 matching experience (kind=experience) when it genuinely complements the outing vibe.",
    "Use ONLY exact IDs from the provided list. Never invent places, prices, hours, or ratings.",
    "Return JSON only: {\"selectedIds\":[...], \"note\":\"1 short warm sentence (max 24 words, no hyphens or dashes) explaining why these picks fit together\"}.",
  ].join(" ");

  let res;
  try {
    res = await paidAnthropicRequest({
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: UNDERSTAND_MODEL,
        max_tokens: 180,
        system,
        messages: [{ role: "user", content: rows }],
      }),
    }, { fetchImpl });
  } catch { return fallback(); }

  if (!res || !res.ok) {
    let errText = "";
    try { errText = await res.text(); } catch { errText = ""; }
    const kind = classifyProviderFailure(res ? res.status : 0, errText);
    if (kind) { try { await tripBreaker("anthropic", kind, errText); } catch {} }
    return fallback();
  }
  let data = {};
  try { data = await res.json(); } catch { return fallback(); }
  const text = (data.content || []).filter((b) => b && b.type === "text").map((b) => b.text).join("");
  const parsed = parseSantaCurate(text, allowedIds, seed.id);
  if (!parsed) return fallback();
  return { ...parsed, source: "santa" };
}
