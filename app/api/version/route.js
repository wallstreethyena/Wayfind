// app/api/version/route.js — which build is the SERVER running?
//
// 2026-08-07, the stale-tab problem, root cause of "I asked for this fix
// multiple times and it's still broken": fixes DID ship (the score law, the
// auth stability), but a deploy only reaches tabs opened after it. The
// owner's 14:47Z screenshot showed the exact inversion the 14:30Z deploy had
// retired — his tab was simply still running the old bundle, and nothing in
// the app could ever notice that. This route is the server half of the fix;
// app/components/VersionWatch.js is the client half.
//
// Uses VERCEL_GIT_COMMIT_SHA (set per-deployment by Vercel). Locally / on a
// platform without it the route answers "" and VersionWatch treats that as
// "never reload" — fail closed, a missing env can never cause a reload loop.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // never cache: the whole point is asking the CURRENT server

export async function GET() {
  const build = process.env.VERCEL_GIT_COMMIT_SHA || ""; // empty = unconfigured, and the client treats empty as "watch off"
  return NextResponse.json({ build }, { headers: { "cache-control": "no-store" } });
}
