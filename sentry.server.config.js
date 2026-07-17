// Sentry — Node (server) runtime. Loaded by instrumentation.js register().
// Dark until SENTRY_DSN is set in the deploy env; Sentry.init no-ops without a
// DSN, so this ships with zero behaviour change. Never commit a DSN/token.
import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "./lib/sentryShared.js";

Sentry.init(
  baseSentryOptions(process.env.SENTRY_DSN, {
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  })
);
