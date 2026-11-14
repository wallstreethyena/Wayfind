import { createReserveHandlers } from "../../../../lib/reserveApi.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req) { return createReserveHandlers().manageGet(req); }
export async function POST(req) { return createReserveHandlers().managePost(req); }
