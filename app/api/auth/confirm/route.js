// Retired public Admin API endpoint.
//
// Confirmation links are issued and verified by Supabase. Accepting an email
// address here would let a caller confirm an address they do not control.
export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    { error: "retired", reason: "Use the Supabase email confirmation flow." },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
