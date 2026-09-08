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

Autocomplete returns a non-cacheable HTTP 503 with an explicit reason when the
gate is closed, `AUTOCOMPLETE_MONTH_CAP` is absent or invalid, or the ledger
denies the request. Only a successful provider response can be a normal HTTP
200 empty suggestion list. A missing server key retains its HTTP 501 response.

The required GitHub `guards` job runs `npm audit --audit-level=moderate` over
the entire lockfile, including build and native development tooling, before
the application guards and production build. A known moderate-or-higher
advisory or an unavailable audit service blocks that job; do not bypass it by
excluding development dependencies.

Production confirmation settings were checked on September 7, 2026: email
signup is enabled and automatic email confirmation is disabled. The spending
ledger RPC is executable by `service_role`, not `anon` or `authenticated`.
These configuration checks do not prove SMTP delivery or provider availability.

The unused `@capacitor/assets` generator was removed because its current
dependency chain contains known vulnerabilities. Committed iOS icon and splash
assets remain in place; Capacitor CLI and iOS sync remain supported. Future
automated artwork regeneration needs a maintained generator rather than
reinstalling the vulnerable package. The scoped `xcode` UUID override retains
its CommonJS `v4()` interface and is verified by parsing the native project.
