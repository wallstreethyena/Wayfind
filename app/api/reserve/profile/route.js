import { createReserveHandlers } from "../../../../lib/reserveApi.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req) { return createReserveHandlers().profileGet(req); }
export async function PUT(req) { return createReserveHandlers().profilePut(req); }
export async function DELETE(req) { return createReserveHandlers().profileDelete(req); }
