// app/api/health/apple-maps/route.js — CAN THE EVENT MAP RENDER TODAY, AND
// FOR HOW MUCH LONGER?
//
// 2026-09-08. The event-page Apple map (#1144) shipped on a MapKit JS token
// that expired on 2026-09-15 and nothing could see it coming: the token is a
// build-time NEXT_PUBLIC_ value, no guard reads it, the canary has no Vercel
// env, and the only symptom would have been readers seeing "The map preview
// is unavailable right now" after a 12-second wait, on a green board.
//
// This route is the production half of the fix. It reads the SAME inlined
// token the client bundle ships (a MapKit JS token is public by design — it
// is in every reader's HTML already, so this exposes nothing) and answers
// with its lifetime. scripts/lib/synthetic/scenarios.mjs asserts on it every
// 30 minutes against www.gowayfind.com and goes red when `ok` is false OR
// `warning` is true — so a dying token is a red run a fortnight early, and a
// dead one is red on the first cycle, never a reader report.
//
// Not a guard-suite member (needs the live env) and not cached (the verdict
// changes with the clock, and the ISR/static route cache would freeze it at
// build time — which is exactly the blindness this exists to end).
import { NextResponse } from "next/server";
import { appleMapsTokenHealth } from "../../../../lib/appleMapsToken.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = appleMapsTokenHealth(process.env.NEXT_PUBLIC_APPLE_MAPS_TOKEN);
  // Never echo the token itself, even though it is public: a health surface
  // should describe, not redistribute.
  return NextResponse.json(
    {
      surface: "event-venue-map",
      provider: "apple-mapkit-js",
      ok: health.ok,
      warning: health.warning,
      // 2026-09-10: `temporary` is the field that answers the owner's actual
      // question ("is the key permanent?") in one word. `urgent` separates
      // "replace this soon" from "replace this within APPLE_MAPS_TOKEN_WARN_DAYS".
      temporary: health.temporary,
      urgent: health.urgent,
      reason: health.reason,
      configured: health.configured,
      format: health.format,
      scope: health.scope,
      issuedAt: health.issuedAt,
      expiresAt: health.expiresAt,
      nonExpiring: health.nonExpiring,
      expired: health.expired,
      daysLeft: health.daysLeft,
      originRestricted: health.originRestricted,
      origins: health.origins,
      checkedAt: new Date().toISOString(),
    },
    { status: health.ok ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
