// app/go/route.js — THE SINGLE REDIRECT OWNER (v6.42).
// Every monetizable outbound click on Wayfind lands here first. This route asks
// lib/monetizeRouter "who pays for this destination?", logs the decision (no
// customer data), and 302s to the ONE affiliate URL — or the canonical
// destination if nothing applies, so the user journey never breaks.
//
// Behind the `affiliate_single_owner_v1` flag: with the flag OFF this route is a
// transparent pass-through to the canonical URL (safe to ship dark, zero
// behavior change), so it deploys before the CTAs are cut over and rolls back
// by flipping one env var.
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { resolveClick } from "../../lib/monetizeRouter";

const flagOn = () => String(process.env["NEXT_PUBLIC_AFF_SINGLE_OWNER"] || process.env["AFFILIATE_SINGLE_OWNER_V1"] || "").trim().toLowerCase() === "on";
const isHttp = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; } };
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return "?"; } };

export function GET(req) {
  const { searchParams } = new URL(req.url);
  const canonical = (searchParams.get("u") || "").trim();
  const intent = (searchParams.get("intent") || "").trim().toLowerCase();
  const linkId = (searchParams.get("id") || "").trim().slice(0, 64);

  // Hard guard: never redirect to a non-http destination (open-redirect / js: safety).
  if (!isHttp(canonical)) return NextResponse.redirect(new URL("/", req.url), 302);

  // Flag OFF -> transparent pass-through to canonical (dark-ship / instant rollback).
  if (!flagOn()) return NextResponse.redirect(canonical, 302);

  // Lodging context for Stay22 (address + coords + dates), when the CTA supplies it.
  const lodgingCtx = intent === "hotel" || intent === "lodging" ? {
    address: (searchParams.get("addr") || "").trim().slice(0, 160) || undefined,
    lat: searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined,
    lng: searchParams.get("lng") ? Number(searchParams.get("lng")) : undefined,
    checkin: (searchParams.get("ci") || "").trim() || undefined,
    checkout: (searchParams.get("co") || "").trim() || undefined,
  } : null;

  let decision;
  try {
    decision = resolveClick({ intent, canonical, lodgingCtx });
  } catch (e) {
    decision = { url: canonical, owner: "canonical" };
  }
  const target = isHttp(decision && decision.url) ? decision.url : canonical;

  // Audit log: linkId / intent / owner / final host ONLY. No customer data, no
  // full destination URL with any query PII. Spec requirement.
  try {
    console.log(JSON.stringify({ tag: "go_redirect", id: linkId || null, intent: intent || null, owner: decision && decision.owner, finalHost: hostOf(target) }));
  } catch (e) {}

  return NextResponse.redirect(target, 302);
}
