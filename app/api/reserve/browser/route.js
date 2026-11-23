import { createLiveBrowserHandlers } from "../../../../lib/bookingAgent/liveBrowser.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  return createLiveBrowserHandlers().status(req);
}

export async function POST(req) {
  return createLiveBrowserHandlers().open(req);
}

export async function DELETE(req) {
  return createLiveBrowserHandlers().close(req);
}
