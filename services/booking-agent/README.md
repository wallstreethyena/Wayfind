# Booking agent worker

This folder is a separate Node process that claims queued rows and runs `runNext` in `lib/bookingAgent/run.js`.

## Status: OFF (owner decision, 2026-11-20)

The booking agent is merged dark. Do not apply `20261117143000_wf_booking_agent.sql`, set
`BOOKING_AGENT_ENABLED` / `BOOKING_AGENT_SITE_OPENTABLE`, or start this worker in production
without a new owner decision. Reserve sends OpenTable restaurants through the prefilled
`/api/reserve/go` handoff instead.

Standing rules for this worker:
- It always identifies itself with the honest Wayfind agent user agent (`AGENT_UA`) in every
  mode; `runNext` refuses any browser presenting a different user agent.
- It never bypasses CAPTCHA or anti-bot checks; if blocked, the user gets the exact booking page.
- A personal Mac is never production infrastructure, and any hosted worker is new spend that
  needs owner approval first.

`BOOKING_AGENT_BROWSER_MODE=chrome` only switches to a visible (headed) Chrome window for local
fixture debugging. Local fixture tests: `node scripts/test-booking-agent.mjs` and
`node scripts/test-booking-agent-browser.mjs` (no live booking site).

Twilio confirmation texts reuse the existing `RESERVE_SMS_ENABLED=1` + Twilio credentials when the guest opts in on the booking card. OpenTable SMS verification codes are relayed inline in the Wayfind chat (`POST /api/reserve/agent/code`).

The only runtime dependency is `playwright-core`. The Next.js app does not import this folder.
