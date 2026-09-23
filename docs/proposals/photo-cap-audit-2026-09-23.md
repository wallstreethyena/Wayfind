# Photo cap audit, September 23 2026

## Background

The owner approved paid Google Place Photos usage at a cap of 3,000 grants
per month on September 15, 2026. That is the only recorded owner approval
for this cap that this audit could find.

## What the Vercel audit trail shows

The Vercel audit trail proves that on September 17, 2026, between 14:09:07
and 14:09:16 UTC, a sequence of Vercel CLI commands changed the
GOOGLE_PHOTOS_MONTH_CAP environment variable. The commands ran under Vercel
user id V6xPCwShHG3rbgZE0g2iVtJW, which is the owner's own account
("wallstreethyena"). Agents running on the owner's Mac also use this same
account, so the account identity alone does not tell us who or what issued
the commands.

The sequence recorded was:

1. `vc env ls`
2. `vc env rm` of GOOGLE_PHOTOS_MONTH_CAP (removed the old value, env id
   CQhjBwl3KZ02iCGp)
3. `vc env add` of GOOGLE_PHOTOS_MONTH_CAP (added the new value, env id
   zOwB365AcSrLfJbR)
4. `vc env ls`

The new value set by this sequence was 7000, more than double the approved
cap of 3,000.

No pull request, commit, document, or other record shows an owner approval
for raising the cap to 7000. As far as this audit found, that change has no
written authorization at all.

The audit trail alone cannot prove whether a person typed these commands or
an automated agent issued them. A search of local agent logs on the owner's
Mac did not find any recorded command matching this sequence, so the source
of the change remains unconfirmed.

## Usage impact

September usage reached 6,024 billed or attempted photo grants against the
cap. By the end of September 17, about 3,553 of those had been billed, so
usage passed the approved 3,000 cap on September 17, the same day the cap
was silently raised to 7000.

## Restoration

On September 23, 2026, at approximately 13:14 UTC, the cap was restored to
3000 by direct owner instruction, and production was redeployed. The
redeploy produced deployments wayfind-1yfpemr7f and wayfind-j1g0k39wb.

## Rule going forward

GOOGLE_PHOTOS_MONTH_CAP must never be raised without explicit written owner
approval recorded in a pull request. A change to this value that does not
point to a PR with that approval should be treated as unauthorized and
reverted.

## Affiliate matches to improve

Sideshow Obscura, the Halloween Horror Nights tribute store (event
sideshow-obscura-hhn35-2026), currently maps to the Undercover Tourist
Universal 3 day ticket (wf_deals id 6). This match is honest in the sense
that the store sits inside Universal Studios, so the ticket is a real way
to visit it. It is still a weak match, since a 3 day park ticket is a much
bigger purchase than a single tribute store visit. Keep this match for now,
and look for a closer affiliate offer to replace it with later.
