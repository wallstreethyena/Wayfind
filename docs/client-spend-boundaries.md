# Client-reachable spend boundaries

Every paid or quota-limited provider credential stays on the server. Browser
modules contain no paid-provider endpoint, Google Places SDK, or public Google
credential. Map rendering uses MapLibre.

`WAYFIND_GATE` accepts only `free` or `open`. Every other value is `shut`.
Enabled calls still require an atomic monthly grant from `wf_spend_take` before
the outbound request. Google, Anthropic, event sources, Viator, Foursquare,
Tripadvisor, YouTube, and Pexels each have a finite cap. Missing or invalid caps,
missing ledger configuration, timeouts, and ledger denials all fail closed.

Authentication signup and confirmation admin proxies are retired. Public probe
parameters cannot disclose provider configuration or trigger provider calls.
Outbound URL checks reject private, local, reserved, credential-bearing, and
DNS-rebinding destinations and validate every redirect hop.

The executable regression scripts use injected transports. They prove denial
and positive controls without contacting a paid provider or changing production
data. Run the complete policy with `node scripts/run-guards.mjs`.
