# Booking agent worker

This folder is a separate Node process that claims queued rows and runs `runNext` in `lib/bookingAgent/run.js`.

## Running the worker locally on macOS (standard headed Chrome)

Install dependencies once inside this folder:
```bash
cd services/booking-agent && npm install
```

Start the continuous polling daemon with standard headed Chrome (`BOOKING_AGENT_BROWSER_MODE=chrome`) and optional Twilio SMS confirmations (`RESERVE_SMS_ENABLED=1`):
```bash
BOOKING_AGENT_ENABLED=1 \
BOOKING_AGENT_SITE_OPENTABLE=1 \
BOOKING_AGENT_BROWSER_MODE=chrome \
SUPABASE_URL=https://<your-project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key> \
node services/booking-agent/runner.js
```

Run a single queued job and exit:
```bash
BOOKING_AGENT_ENABLED=1 BOOKING_AGENT_SITE_OPENTABLE=1 BOOKING_AGENT_BROWSER_MODE=chrome node services/booking-agent/runner.js --once
```

On a headless Linux host (Fly.io / Railway / VPS), run under `xvfb-run -a node services/booking-agent/runner.js` with `BOOKING_AGENT_BROWSER_MODE=chrome`.

Twilio confirmation texts reuse the existing `RESERVE_SMS_ENABLED=1` + Twilio credentials when the guest opts in on the booking card. OpenTable SMS verification codes are relayed inline in the Wayfind chat (`POST /api/reserve/agent/code`).

The only runtime dependency is `playwright-core`. The Next.js app does not import this folder.
