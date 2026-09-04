export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import atlasCards from "../../../../../data/atlas/editorial-cards.json";
import { aiKey } from "../../../../../lib/aiKey.js";
import { jobCannotRun } from "../../../../../lib/jobFail.js";

const MODEL = "claude-haiku-4-5";
const MAX_IMAGES = 8;

function publicHttpUrl(value, base) {
  try {
    const url = new URL(String(value || ""), base);
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) return null;
    return url.toString();
  } catch { return null; }
}

function pageImages(html, pageUrl) {
  const out = [];
  const add = (value) => {
    const url = publicHttpUrl(String(value || "").replace(/&amp;/g, "&"), pageUrl);
    if (url && !out.includes(url)) out.push(url);
  };
  for (const match of String(html || "").matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["'][^>]*>/gi)) add(match[1]);
  for (const match of String(html || "").matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*>/gi)) add(match[1]);
  for (const match of String(html || "").matchAll(/["']image["']\s*:\s*["']([^"']+)["']/gi)) add(match[1]);
  return out.slice(0, MAX_IMAGES);
}

async function imagesFromPage(pageUrl) {
  const safe = publicHttpUrl(pageUrl);
  if (!safe) return [];
  const response = await fetch(safe, {
    headers: { "user-agent": "Wayfind menu-image verifier/1.0" },
    redirect: "follow", signal: AbortSignal.timeout(6500), cache: "no-store",
  });
  if (!response.ok || !String(response.headers.get("content-type") || "").includes("text/html")) return [];
  return pageImages((await response.text()).slice(0, 1_500_000), response.url || safe);
}

async function matchesDish(imageUrl, restaurant, mustTry, key) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      model: MODEL, max_tokens: 100, temperature: 0,
      system: "Verify restaurant imagery conservatively. Return only compact JSON: {\"matches\":boolean,\"confidence\":number,\"reason\":string}. matches may be true only when the visible food is specifically consistent with the named must-try item, not merely any food, menu text, an interior, or a building. If uncertain, return false.",
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "url", url: imageUrl } },
        { type: "text", text: `Restaurant: ${restaurant}\nMust-try recommendation: ${mustTry}\nDoes this photograph show that specific item?` },
      ] }],
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const text = payload?.content?.[0]?.text || "";
  const found = text.match(/\{[\s\S]*\}/);
  if (!found) return null;
  const verdict = JSON.parse(found[0]);
  return {
    matches: verdict.matches === true,
    confidence: Math.max(0, Math.min(1, Number(verdict.confidence) || 0)),
    reason: String(verdict.reason || "").slice(0, 240),
  };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const visionKey = aiKey();
  if (!url || !service || !visionKey) {
    return jobCannotRun("lunch-images", "Supabase or vision configuration is missing");
  }

  const limit = Math.max(1, Math.min(12, Number(new URL(request.url).searchParams.get("limit")) || 6));
  const db = createClient(url, service, { auth: { persistSession: false } });
  const eligible = atlasCards.filter((card) => card?.placeId && card?.category === "food" && String(card?.foodMove || "").trim());
  const ids = eligible.map((card) => card.placeId);
  const staleBefore = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent, error: readError } = await db.from("wf_lunch_dish_images").select("place_id,checked_at").in("place_id", ids);
  if (readError) return jobCannotRun("lunch-images", readError.message);
  const fresh = new Set((recent || []).filter((row) => row.checked_at >= staleBefore).map((row) => row.place_id));
  const queue = eligible.filter((card) => !fresh.has(card.placeId)).slice(0, limit);
  const rows = [];

  for (const card of queue) {
    let selected = null;
    let best = null;
    let selectedSource = null;
    const sources = [...new Set([card.officialWebsite, ...(card.sourceUrls || [])].filter(Boolean))].slice(0, 6);
    const images = [];
    for (const source of sources) {
      const found = await imagesFromPage(source).catch(() => []);
      for (const image of found) if (!images.some((item) => item.url === image)) images.push({ url: image, source });
      if (images.length >= MAX_IMAGES) break;
    }
    for (const image of images.slice(0, MAX_IMAGES)) {
      const verdict = await matchesDish(image.url, card.name, card.foodMove, visionKey).catch(() => null);
      if (!verdict || !verdict.matches || verdict.confidence < 0.75) continue;
      if (!best || verdict.confidence > best.confidence) { selected = image.url; selectedSource = image.source; best = verdict; }
    }
    rows.push({
      place_id: card.placeId,
      image_url: selected,
      source_url: selectedSource,
      must_try: card.foodMove,
      confidence: best?.confidence || null,
      reason: best?.reason || "No restaurant-owned source image could be verified as the exact must-try item; use the restaurant photo.",
      checked_at: new Date().toISOString(),
    });
  }

  if (rows.length) {
    const { error } = await db.from("wf_lunch_dish_images").upsert(rows, { onConflict: "place_id" });
    if (error) return jobCannotRun("lunch-images", error.message);
  }
  return Response.json({ checked: rows.length, exactDishImages: rows.filter((row) => row.image_url).length, restaurantFallbacks: rows.filter((row) => !row.image_url).length });
}
