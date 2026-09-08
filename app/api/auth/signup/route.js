// Retired public Admin API endpoint.
//
// Email ownership is established only by Supabase's confirmation flow in the
// browser client. This endpoint must never read service-role configuration or
// contact an upstream service.
export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    { error: "retired", reason: "Use the Supabase email confirmation flow." },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
