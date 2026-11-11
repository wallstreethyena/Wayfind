import { createReserveHandlers } from "../../../../lib/reserveApi.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req) { return createReserveHandlers().respondGet(req); }
export async function POST(req) { return createReserveHandlers().respondPost(req); }
