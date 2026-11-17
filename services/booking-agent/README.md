# Booking agent worker

This folder is a separate Node process that claims queued rows and runs `runNext` in `lib/bookingAgent/run.js`. The same function is what a Vercel Sandbox would call.

Neither host is configured. There is no Vercel project, cron, or start script that launches it. The Next.js app does not import this folder.

The only runtime dependency is `playwright-core`. The browser uses the user agent `WayfindBookingAgent/0.1 (+https://www.gowayfind.com/booking-agent)`.

Do not point it at a live booking site until the switches, the migration, and a human selector capture are all done. See the pull request for that list.
