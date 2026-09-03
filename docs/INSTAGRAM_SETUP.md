# Instagram, without getting blocked — the 15-minute setup

**The short version:** there is no loophole worth taking, and there is a free
official API that does exactly what we want. Everything below is Meta's own
sanctioned path. Nothing here scrapes instagram.com.

## Why scraping keeps failing (and must keep failing)

| what we tried | why it dies |
|---|---|
| `WebFetch`/`curl` on an `instagram.com` URL | `robots.txt` disallows it — our own fetchers refuse before a request is made |
| `?__a=1`, `/p/<code>/?__a=1` JSON | removed by Meta in 2021–22; answers a login wall |
| headless browser scraping the HTML | violates Meta's Platform Terms; enforcement is an IP/account ban |

We run a public web app. An IP or account ban is a real business risk, so
scraping is off the table permanently — not because it is hard, because the
downside is losing the account.

## What the official API gives us

Two endpoints, both free, both on the Instagram Graph API:

1. **Hashtag Search** → `/ig_hashtag_search` then `/{hashtag-id}/top_media`.
   **Meta ranks `top_media` by engagement**, so "#sarasotaevents top media" is
   literally "the popular posts about Sarasota events". Returns `like_count`
   and `comments_count`.
   *Hard cap: 30 unique hashtags per rolling 7 days, per IG account.*
   `lib/instagramSources.js` rotates a weekly slice to stay inside it.

2. **Business Discovery** → `business_discovery.username(<handle>)`.
   Reads any **public business/creator** account's recent media with
   `like_count` and `comments_count`. This is the one that matters most:
   Hunsader, Fruitville Grove, Sir Henry's, The Bay, Selby and Mote announce
   their fall programming on their own grid days before it reaches a calendar
   or a ticketing API — which is precisely the inventory the fall shelves were
   missing.

### The one thing the API will not give us

**Share counts do not exist for other people's media.** Shares and saves are
only available in `/insights` on media *you own*. So the ranking uses
`likes + 3×comments` (comments weighted higher — on event posts that is where
"what time?" and "is this still on?" live). Nothing in the code pretends to a
share count; inventing one would be the same class of lie as a fabricated date.

## Setup (one time, ~15 minutes, free)

1. **Make the Wayfind Instagram account a Business or Creator account.**
   Instagram app → Settings → Account type and tools → Switch to professional.
2. **Link it to a Facebook Page.** Any Page you control; create an empty
   "Wayfind" Page if there isn't one. Instagram → Settings → Sharing to other
   apps → Facebook.
3. **Create a Meta app** at <https://developers.facebook.com/apps> →
   type **Business** → add the **Instagram Graph API** product.
4. **Grant these permissions** in the Graph API Explorer, with your Page
   selected: `instagram_basic`, `pages_show_list`, `pages_read_engagement`.
   (`instagram_manage_insights` too if you later want insights on our own posts.)
5. **Get the IG Business Account ID:** in the Graph API Explorer run
   `me/accounts` → copy the Page id → run
   `{page-id}?fields=instagram_business_account`. The returned id is
   `IG_BUSINESS_ACCOUNT_ID`.
6. **Get a long-lived token.** The Explorer gives a short-lived user token;
   exchange it:
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
       ?grant_type=fb_exchange_token
       &client_id={app-id}
       &client_secret={app-secret}
       &fb_exchange_token={short-lived-token}
   ```
   That returns a ~60-day token. Store it as `IG_GRAPH_TOKEN`.
7. **Put both in Vercel** (Production + Preview) and redeploy:
   ```
   IG_GRAPH_TOKEN=...
   IG_BUSINESS_ACCOUNT_ID=...
   ```

The scout lights up on the next run. Until then it returns
`{ configured: false }` and makes zero network calls.

> **Token refresh.** The long-lived token lasts ~60 days and is refreshable by
> calling the same endpoint again before it expires. Set a calendar reminder, or
> the scout will simply start reporting errors and writing nothing — it fails
> closed, it never publishes stale or fabricated data.

## What happens then

`/api/cron/instagram-scout` (daily) writes into **`wf_social_candidates`**:
permalink, caption, like/comment counts, whether the caption carries a date and
a time, and a `lead_score` that favours **videos that name a date**.

`wf_social_candidates` is a **lead list, not a feed**. Nothing in it renders.
A lead becomes a card only after a human verifies the date against the
organiser — the same rule that de-dated HorsePower for Kids on 2026-09-03 when
its stored October dates turned out to come from an aggregator rather than the
sanctuary.

Triage the strongest leads with:

```sql
select lead_score, like_count, comments_count, is_video, has_date, handle, hashtag,
       left(caption, 120) as caption, permalink
  from wf_social_candidates
 where review_status = 'new'
 order by lead_score desc
 limit 40;
```
