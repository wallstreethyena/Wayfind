# Proposal for AGENTS.md (owner-only file): QA sessions opt out of partner redirects

Status: proposed, owner to merge into AGENTS.md. Related: docs/claude-lessons.md "Synthetic redirect traffic".

Add under the QA / live-site testing rules:

> **Live-site QA must not follow affiliate redirects.** Before clicking any partner
> button (Book, Tickets, Order, anything served by `/api/*/go`) on gowayfind.com, every
> agent or automated browser session sets `document.cookie = "wf_qa=1; path=/; SameSite=Lax"`
> (session cookie), or sends header `x-wayfind-qa: 1`, or uses a UA containing `WayfindQA/`.
> Such requests are redirected to our own site and logged as `provider_redirect_refused`
> (`refusal_class=qa`); they never reach a partner and never count as shoppers. Do not
> click partner buttons without it. To verify a real partner redirect, use the synthetic
> monitor or `scripts/watchdog-affiliate-links.mjs`, not a browser session.

Notes: the cookie is not a secret and only ever makes a request LESS able to reach a
partner. Clear it (`document.cookie = "wf_qa=; Max-Age=0; path=/"`) in a browser you later use as a customer.
