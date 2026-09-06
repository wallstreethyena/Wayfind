# Sibling finding: operator routes authenticate with a secret in the query string

Raised 2026-09-04 during the Foursquare provider-selection lane. **Recorded, not fixed.**
The Foursquare PR deliberately does not migrate these; turning that PR into a repo-wide
authentication change would have made a small, verifiable fix unreviewable.

## The finding

Several internal/operator routes accept `CRON_SECRET` either as an `Authorization: Bearer`
header **or** as a `?key=` query parameter, and document that as the contract. For example
`app/api/sources/compare/route.js`:

```js
if (!secret || (auth !== "Bearer " + secret && searchParams.get("key") !== secret)) {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
```

The fail-closed behaviour is correct. The `?key=` half is the problem.

## Why a secret in a URL is different from a secret in a header

A URL is copied, logged and stored in far more places than a request header:

- server and CDN access logs, and any proxy in front of them
- browser history and the address bar, including screenshots and screen shares
- `Referer` headers sent to third parties on any outbound link from that page
- analytics and error-reporting payloads that capture the full URL
- shell history, pasted links in chat, bookmarks, ticket attachments

None of those is exotic. A single screenshot of a terminal or a browser tab leaks a
long-lived operator credential that gates real spend and service-role reads.

## Scope

Routes accepting `?key=` as an alternative to the Bearer header, as of `9f1a32a3`:

- `app/api/sources/compare/route.js`
- `app/api/ta/place/route.js` (the `probe=2` branch)
- the `app/api/cron/**` family, where the pattern originated

`/api/fsq/search?probe=1`, added in this lane, is **Bearer-only** and does not join them.

## Recommended follow-up lane (not this PR)

1. Move operator/internal routes to `Authorization: Bearer` only, where compatibility
   permits. Vercel Cron sends a header, so most cron routes need no query form at all.
2. Where a query form must survive for a period, log a deprecation and set an end date **as
   an exported constant, not a comment**, so a guard can enforce it (see
   `check-seasonal-expiry` in `AUDIT-2026-09-04.md` for the pattern — a date in a comment
   cannot fail a build).
3. Add `scripts/check-no-secret-in-query.mjs`: fail if any `app/api/**/route.js` compares a
   `searchParams.get(...)` value against `CRON_SECRET`, `METRICS_SECRET` or any
   `*_SECRET`/`*_TOKEN` env var. Compare comment-stripped source so the guard cannot fire on
   prose that merely discusses the pattern.
4. Rotate `CRON_SECRET` after the migration, since the current value has been transmitted in
   URLs and may already sit in logs.

## Related standard

> **Fallback must depend on whether the upstream produced a valid answer, not on whether its
> failure happened to carry one of the status codes we predicted.**

That is the root-cause statement from the Foursquare outage in this same lane, and it
generalises: an allowlist of anticipated conditions is a list the next change can fall
outside of. It belongs in `CLAUDE.md` alongside the existing guard-writing rules. It is left
out of the Foursquare PR on purpose — `CLAUDE.md` is edited concurrently by two other
sessions, so a one-line addition there is safer as its own commit than as a passenger on a
code change.
