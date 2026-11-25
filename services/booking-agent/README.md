# Booking agent worker

This folder is a separate Node process that claims queued rows and runs `runNext` in `lib/bookingAgent/run.js`.

## Status: runs on Wayfind's own hosting (owner decision, 2026-11-25)

On 2026-11-21 the owner chose to turn on the honest OpenTable booking agent, and on 2026-11-25
chose to run it on Vercel instead of a separate server. Production does not use this folder:
`app/api/cron/booking-agent` (every minute) and `app/api/reserve/agent/start` (right after a
guest's tap, through `after()`) call `lib/bookingAgent/serverlessRun.js`, which drives a
Browserbase cloud browser over raw CDP (`lib/bookingAgent/cdpSession.js`), so the Next.js app
never imports playwright-core. The tables are applied (`20261117143000_wf_booking_agent.sql`).
It still runs only when `BOOKING_AGENT_ENABLED=1`, `BOOKING_AGENT_SITE_OPENTABLE=1`, the
opentable row in `wf_booking_agent_sites` is `on`, and the restaurant is on the allowlist
(`lib/bookingAgent/placeAllowlist.js`, Summer House on the Lake only). Set the row to `paused`
or `off` to stop it at once.

This folder stays for local fixture runs and a hosted worker if one is ever approved.

Standing rules for this worker:
- It always identifies itself with the honest Wayfind agent user agent (`AGENT_UA`) in every
  mode, Browserbase included; `runNext` refuses any browser presenting a different user agent.
- Its Browserbase sessions ask for no proxy and solve no challenge, and a cookie banner gets
  its most private choice, never "accept all".
- It never bypasses CAPTCHA or anti-bot checks; if blocked, the user gets the exact booking page.
- A personal Mac is never production infrastructure, and any hosted worker is new spend that
  needs owner approval first.

`BOOKING_AGENT_BROWSER_MODE=chrome` only switches to a visible (headed) Chrome window for local
fixture debugging. Local fixture tests: `node scripts/test-booking-agent.mjs` and
`node scripts/test-booking-agent-browser.mjs` (no live booking site).

Twilio confirmation texts reuse the existing `RESERVE_SMS_ENABLED=1` + Twilio credentials when the guest opts in on the booking card. OpenTable SMS verification codes are relayed inline in the Wayfind chat (`POST /api/reserve/agent/code`).

The only runtime dependency is `playwright-core`. The Next.js app does not import this folder.
