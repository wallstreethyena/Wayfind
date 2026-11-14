// GET /api/owned-social — the "Seen on Wayfind" shelf under TRENDING NOW:
// every live, eligible Reel and carousel Wayfind published on @gowayfind.app,
// newest first, served in pages (?offset=&limit=, default 12, max 24) so a
// phone never downloads the whole catalog (lib/ownedSocial.js shelfPage).
//
// A failed read answers 503 { ok:false }, NEVER an empty 200: "Wayfind has no
// posts" and "we could not read the table" must not look the same, or the
// reconciliation cron could not tell a broken shelf from an empty one.
import { shelfPage } from "../../../lib/ownedSocial.js";
import { readOwnedRows } from "../../../lib/ownedSocialStore.js";
import { siteTodayStr } from "../../../lib/siteTime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const today = siteTodayStr();
  let offset = 0, limit;
  try {
    const q = new URL(request && request.url ? request.url : "https://x/").searchParams;
    offset = q.get("offset"); limit = q.get("limit");
  } catch (e) {}
  try {
    const rows = await readOwnedRows({ shelfOnly: true });
    const page = shelfPage(rows, today, { offset, limit });
    return Response.json({ ok: true, today, count: page.items.length, total: page.total, next_offset: page.next_offset, items: page.items }, {
      headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    return Response.json({ ok: false, today, error: String(e && e.message || e).slice(0, 200) }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
