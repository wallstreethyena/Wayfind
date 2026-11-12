// GET /api/owned-social — the "Seen on Wayfind" shelf under TRENDING NOW:
// every live, eligible Reel and carousel Wayfind published on @gowayfind.app,
// newest first, never capped (lib/ownedSocial.js selectShelf).
//
// A failed read answers 503 { ok:false }, NEVER an empty 200: "Wayfind has no
// posts" and "we could not read the table" must not look the same, or the
// reconciliation cron could not tell a broken shelf from an empty one.
import { selectShelf, toShelfItem } from "../../../lib/ownedSocial.js";
import { readOwnedRows } from "../../../lib/ownedSocialStore.js";
import { siteTodayStr } from "../../../lib/siteTime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const today = siteTodayStr();
  try {
    const rows = await readOwnedRows({ shelfOnly: true });
    const items = selectShelf(rows, today).map(toShelfItem);
    return Response.json({ ok: true, today, count: items.length, items }, {
      headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    return Response.json({ ok: false, today, error: String(e && e.message || e).slice(0, 200) }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
