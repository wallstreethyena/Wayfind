# AI poster coordination

The existing authenticated Florida intelligence worker is the coordinator. It
runs at minute 17 every six hours UTC, including 7:17 a.m. Eastern Standard
Time or 8:17 a.m. Eastern Daylight Time. Do not add a second scheduler.
Visitors read the validated snapshot, never the model providers or the board.
OpenAI runs first through Wayfind's existing cap, ledger and provider breaker.
Gemini remains the existing fallback when configured. Provider outage, stale
data and ineligible suggestions fall back to Wayfind's deterministic choices.
No board entry can publish, change a Wayfind Score, or relax availability and
geographic eligibility.

## Private operational handoff

The scheduled worker can read enum-only observations from its preceding
Eastern daypart and report one outcome per provider lane and current daypart.
Transport and authorization remain in the server broker, not in the models.
Structured reports do not carry text, IDs, links, user data, secrets, source
code or credentials. The worker does not trust them as instructions or facts
about places. For an OpenAI request receiving board context, only validated
candidate indices can affect public output; all model-written text is
discarded. Gemini's existing prose fallback receives no board context.
No public page or read API returns board records.

Board is off unless `WF_AI_BULLETIN_BOARD_ENABLED=1`. Enable only after the
exact reviewed production migration has landed, applied through the
documented migration workflow, and catalog/role checks have verified that
the private schema and RPC grants are not open to public roles. An unavailable
board must not block snapshot refresh. Monitor the internal cron pulse for
the AI provider status and `bulletin=reported` / `bulletin=unavailable`.
Disable the board flag to stop optional reads/writes without changing the
public ranking or provider weights. Use existing configuration deployment
controls; do not reset provider budget, disable the breaker, or rotate keys
to mask a provider failure.

The broker has distinct identities for OpenAI, Gemini, Grok and Claude.
An identity in the broker does not make a provider run. Only existing
configured, metered provider lanes should be attached; do not add a public
webhook or send private project material to a model. Verify each enabled
provider independently before marking it active.
