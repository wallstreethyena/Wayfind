// Sentry — Edge runtime (middleware.js + any edge routes). Loaded by
// instrumentation.js register(). Same errors-only, DSN-gated config as the
// server runtime; dark until SENTRY_DSN is set. Never commit a DSN/token.
import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "./lib/sentryShared.js";

Sentry.init(
  baseSentryOptions(process.env.SENTRY_DSN, {
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  })
);
