# OpenTable selector map (placeholder)

`opentable.v1.json` is a PLACEHOLDER. Every selector in it was written to match the synthetic HTML under `tests/fixtures/booking-agent/opentable`. Those pages were written by hand. They are not copies of OpenTable.

A human has to replace the selectors after a supervised manual capture of the real guest form (restref), on a machine where someone is watching the browser. Do not fetch opentable.com, resy.com, or exploretock.com to fill this file. Do not paste live HTML into the repo.

Until that capture lands, the map's `status` stays `PLACEHOLDER`. The worker will still refuse to launch unless all three switches are on.
