# Booking agent worker

This folder is a separate Node process that claims queued rows and runs `runNext` in `lib/bookingAgent/run.js`.

## Running the worker

Install dependencies once inside this folder:
```bash
cd services/booking-agent && npm install
```

Start the continuous polling daemon (requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BOOKING_AGENT_ENABLED=1`, `BOOKING_AGENT_SITE_OPENTABLE=1`, and the `wf_booking_agent_sites` row for `opentable` set to `on`):
```bash
node services/booking-agent/runner.js
```

Run a single queued job and exit:
```bash
node services/booking-agent/runner.js --once
```

On macOS/Windows, real Chrome (`channel: "chrome"`) is launched directly. On a headless Linux server, run under `xvfb-run -a node services/booking-agent/runner.js` so OpenTable serves the live availability and guest form pages cleanly.

The only runtime dependency is `playwright-core`. The Next.js app does not import this folder.
