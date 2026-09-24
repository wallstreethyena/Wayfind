# Wayfind Jev MCP

## Purpose

This is a small, owner-only remote MCP server that lets ChatGPT/Astra ask Jev bounded judgement questions without giving Jev control of Wayfind production systems.

Jev is deliberately **not** used as a factual retrieval source, a ranking replacement, or an authorization layer. A Jev answer is evidence-free judgement over the state supplied in that one call. Destructive or irreversible actions still require the normal Wayfind evidence and owner controls.

## Tools

- `jev_status` — no TypeSafe call; reports whether the gateway is configured.
- `jev_check` — up to 8 yes/no proposition probabilities in one TypeSafe request.
- `jev_classify` — one choice from 2-12 bounded labels.
- `jev_score` — one score over a 2-10 level ordered rubric.

Every paid tool makes exactly one `POST https://api.typesafe.ai/v1/systemone` request. There are no automatic retries, so a transient failure cannot silently double TypeSafe usage.

## Required secrets

Set these on the `wayfind-jev-mcp` Edge Function. Never commit their values.

- `TYPESAFE_API_KEY` — TypeSafe/Jev API key.
- `JEV_MCP_OWNER_USER_ID` — the Supabase Auth user UUID allowed to use Jev. The function fails closed with 503 when this is missing and 403 for every other signed-in user.
- `TYPESAFE_MODEL` — optional. Defaults to `jev-latest`.

The function never uses a Supabase service-role key.

## Supabase Auth settings

The production project must use an asymmetric JWT signing key (ES256 or RS256) and have the OAuth 2.1 server enabled.

Under **Authentication > OAuth Server**:

1. Enable OAuth 2.1 Server.
2. Set the authorization path to `/oauth/consent`.
3. Enable dynamic client registration so ChatGPT can register itself.
4. Keep explicit user consent enabled.
5. Set the Auth Site URL to the deployed Wayfind origin that serves `/oauth/consent`.

The Edge Function must be deployed with **gateway JWT verification disabled** (`verify_jwt=false`). This is intentional: `withOAuthProtectedResource()` must be able to answer unauthenticated OAuth discovery requests, and `withSupabase({ auth: 'user' })` performs the actual user-token verification inside the function.

Do not deploy this function as an unauthenticated public MCP server.

## ChatGPT endpoint

Production endpoint after deploy:

`https://gbhtoehdxkzjsmmkisgu.supabase.co/functions/v1/wayfind-jev-mcp`

In ChatGPT Business, enable developer mode, create a custom app/connector, paste the endpoint, and scan tools. The OAuth flow should open Wayfind `/oauth/consent`; only the configured owner account can proceed to the Jev tools.

## Smoke checks

Before connecting ChatGPT:

1. Unauthenticated MCP initialize returns 401 with a `WWW-Authenticate` header pointing to `oauth-protected-resource`.
2. The metadata document points to the Wayfind Supabase Auth server.
3. A non-owner Wayfind user gets 403.
4. The owner can call `jev_status` without consuming TypeSafe usage.
5. With no `TYPESAFE_API_KEY`, paid tools return an explicit `typesafe_unconfigured` error and no judgement.
6. With the key installed, a tiny `jev_check` makes one upstream call and returns a probability plus TypeSafe usage metadata.

## Rollback

Disable or undeploy only the `wayfind-jev-mcp` function. The consent route is inert unless an OAuth authorization flow reaches it. No existing rails, place ranking, refresh clocks, user data, or affiliate logic depends on this integration.
