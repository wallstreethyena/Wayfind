// Wayfind List Engine — generation route (v5.69). Turns a set of ranked places
// into a screenshot-and-send list. Loud contract, mirrored on /api/moment/picks:
//   400  malformed input (never a silent 200)
//   200  { ok:false, reason }   honest no-list envelope (no satisfiable type)
//   200  { ok:true, list, ... } a validated list
//   200  { ok:false, reason:"validation_failed", violations } the model couldn't
//        satisfy the hard rules even after one rewrite pass (do NOT ship)
//   503  generation offline (no ANTHROPIC_API_KEY configured)
// No UI calls this yet — the engine is proven here first, wired in a later PR.
import { claudeJson, logLlmCall } from "../../../../lib/insiderServer.js";
import { LIST_SYSTEM_PROMPT, LIST_TYPE_BY_ID, qualifyingPlaces, selectListTypes, buildListInput, validateListOutput, buildCardFromList } from "../../../../lib/listEngine.js";
import { listSlug, buildSnapshot, putSnapshot } from "../../../../lib/listStore.js";
import { SITE_URL } from "../../../../lib/site.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badRequest(error, detail) {
  try { console.log(JSON.stringify({ tag: "list_generate_400", error, detail })); } catch (e) {}
  return Response.json({ error, detail: detail || null }, { status: 400 });
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch (e) { return badRequest("invalid_json"); }
  if (!body || typeof body !== "object") return badRequest("invalid_body");

  const city = typeof body.city === "string" ? body.city.trim() : "";
  if (!city) return badRequest("missing_city");
  const category = typeof body.category === "string" ? body.category.trim() : "eat";
  if (!Array.isArray(body.places)) return badRequest("places_must_be_array");
  const places = body.places.filter((p) => p && typeof p === "object" && p.name);
  if (!places.length) return badRequest("no_valid_places");
  if (body.list_type != null && !LIST_TYPE_BY_ID[body.list_type]) return badRequest("unknown_list_type", String(body.list_type));

  const ctx = { local_time: body.local_time || "", weather: body.weather || null };

  // Pick the list type: an explicit, satisfiable request wins; otherwise the
  // strongest auto-selected type. An unavailable (unfakeable) type is refused.
  let chosen = null;
  if (body.list_type) {
    const t = LIST_TYPE_BY_ID[body.list_type];
    if (!t.available) return Response.json({ ok: false, reason: "list_type_unavailable", detail: t.reason });
    if (qualifyingPlaces(t, places, ctx).length < 3) return Response.json({ ok: false, reason: "too_few_qualifying", list_type: t.id });
    chosen = t.id;
  } else {
    const ranked = selectListTypes(places, ctx);
    if (!ranked.length) return Response.json({ ok: false, reason: "no_satisfiable_list_type", candidates: places.length });
    chosen = ranked[0].id;
  }

  const input = buildListInput({
    city, neighborhood: body.neighborhood || "", local_time: ctx.local_time,
    day_of_week: body.day_of_week || "", weather: ctx.weather, category,
    list_type: chosen, places,
  });

  // Guard the model bill: if the key is absent, say so plainly instead of a
  // silent empty list.
  if (!(process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY)) {
    return Response.json({ ok: false, reason: "generation_offline", list_type: chosen, qualifying: input.places.length }, { status: 503 });
  }

  let out = await claudeJson(LIST_SYSTEM_PROMPT, JSON.stringify(input), 1500);
  await logLlmCall("list_generate");
  let check = validateListOutput(out, category);

  // One rewrite pass: hand the model its own violations and ask for a clean
  // pass. Cheap insurance against a stray dash or a second contrarian.
  if (out && !check.ok) {
    const fix = JSON.stringify(input) + "\n\nYour previous attempt broke these rules. Rewrite the JSON so every one is fixed, changing nothing else:\n" + check.violations.map((x) => "- " + x).join("\n");
    const retry = await claudeJson(LIST_SYSTEM_PROMPT, fix, 1500);
    await logLlmCall("list_generate_retry");
    const recheck = validateListOutput(retry, category);
    if (retry && recheck.ok) { out = retry; check = recheck; }
    else if (retry) { out = retry; check = recheck; }
  }

  if (!out) return Response.json({ ok: false, reason: "generation_failed", list_type: chosen });
  if (!check.ok) {
    try { console.log(JSON.stringify({ tag: "list_generate_invalid", list_type: chosen, violations: check.violations })); } catch (e) {}
    return Response.json({ ok: false, reason: "validation_failed", list_type: chosen, violations: check.violations, list: out });
  }

  // Freeze this list into an immutable snapshot so its already-shared card never
  // changes. generated_at is stamped here (authoritative), not trusted from the
  // model; v is its epoch. A re-rank later writes a NEW v under the same slug.
  out.generated_at = new Date().toISOString();
  const openCount = places.filter((p) => p.open_now === true).length;
  const card = buildCardFromList(out, places, { city, local_time: ctx.local_time, day_of_week: body.day_of_week || "", weather: ctx.weather, open_count: openCount || null });
  const slug = listSlug(city, chosen);
  const snap = buildSnapshot({ slug, city, list_type: chosen, list: out, card });
  const stored = await putSnapshot(snap);

  return Response.json({
    ok: true, list_type: chosen, qualifying: input.places.length,
    slug, v: snap.v, stored,
    share_url: `${SITE_URL}/l/${slug}`,
    image_url: `${SITE_URL}/api/og/${slug}?v=${snap.v}`,
    card, list: out,
  });
}
