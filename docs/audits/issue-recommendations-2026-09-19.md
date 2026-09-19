# September 19 issue follow-through

Base and inspected production revision: `f313b6df2e8663a1d6902a10c9b9648b316a3317`.

## Scoped repairs

- #413: apply existing nightlife venue identity, review floor, rating and operational eligibility to the inventory-first landing path. Preserve the existing landing score computation, governed score stamping, selection and ordering. Restaurant-primary live-music venues remain eligible; restaurant bar amenities do not qualify on that tag alone.
- #405: a venue appearing in the card inventory no longer grants its domain content-source permission on unrelated cards. Preserve own-site evidence and the explicitly recorded Venice Fishing Pier → Sharky's and Sharky's → Fins source relationships. No prose or source claims were added.
- #407: remove the unused four UGC and two unvetted grandfather entries. Before removal, the guard reported zero references using either exception rule.

Both failure classes were exercised against the previous behavior and the repair. The nightlife integration test calls the inventory-only landing path, checks positive and negative venues and governed scores. The source fixture proves that adding another vetted card cannot silently expand source permissions. Focused checks passed: landing inventory 73 assertions, nightlife ranking 85, source guard 1,289. Astra independently reviewed the changes and reran focused checks.

## Existing production fixes verified without changes

Read-only checks on September 19 established:

- Affiliate health (#511): zero `link_ok=true` rows with HTTP 403/429; the preventing database constraint exists and is validated; the legacy competing cron writer is inactive. No migration was replayed. Whether unknown links may be served remains a separate policy question; this patch does not change it.
- Job-watch (#446): 48 runs in the inspected 48-hour window, zero recorded failures. 36 runs recorded accepted notifications. Existing incident messages were independently marked delivered by Resend, including September 19 at 17:45 UTC. No recovery message was observed in the inspected sample, so live recovery delivery is not claimed. No new messages were sent during verification.
- Discovery (#1135): the production version matched the inspected base. Vercel showed successful search endpoint responses, but cached/owned-inventory fallbacks mean HTTP 200 does not establish Google recovery. No billing log matches or recent Google rows in the inspected provider-usage table supplied affirmative recovery evidence. Upstream recovery remains unknown. No paid provider request, billing enablement, quota change or credential rotation was performed.

Refresh, shuffle, cache timing, score algorithms, photos, affiliate routing and spending limits are outside this patch and unchanged. Other old design proposals and branch cleanup remain separate tasks.
