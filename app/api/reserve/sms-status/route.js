// Delivery receipts for guest booking texts (lib/reserveSms.js). Called by the SMS provider, not by browsers, so it is
// not behind the same-origin guard: every request must carry a valid provider signature over the exact configured
// callback URL, from the configured account, or nothing is written. Status only moves forward.
import { NextResponse } from "next/server";
import { applySmsStatusCallback, smsConfig } from "../../../../lib/reserveSms.js";
import { createReserveRepository, reserveConfiguration } from "../../../../lib/reserveRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const env = process.env;
  const cfg = smsConfig(env);
  if (!cfg) return new NextResponse(null, { status: 404 });
  let params = {};
  try {
    const text = await req.text();
    if (text.length > 8000) return new NextResponse(null, { status: 413 });
    params = Object.fromEntries(new URLSearchParams(text));
  } catch { return new NextResponse(null, { status: 400 }); }
  let repository;
  try { repository = createReserveRepository(reserveConfiguration(env)); } catch { return new NextResponse(null, { status: 503 }); }
  const out = await applySmsStatusCallback({ repository, params, env, signature: req.headers.get("x-twilio-signature"), url: cfg.callbackUrl });
  if (out.ok) return new NextResponse(null, { status: 204 });
  if (out.code === "BAD_SIGNATURE" || out.code === "WRONG_ACCOUNT") return new NextResponse(null, { status: 403 });
  if (out.code === "BAD_PAYLOAD") return new NextResponse(null, { status: 400 });
  return new NextResponse(null, { status: 503 }); // storage: the provider retries
}
