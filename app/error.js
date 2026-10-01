"use client";
// Route-level error boundary. Before 2026-09-30 the app had none, so any error
// React caught on a route — including a JavaScript chunk that failed to load —
// ended on Next's bare white "Application error" page. The root layout stays
// on screen; see lib/chunkRecovery.js for the rule and app/global-error.js for
// the layer above this one.
import RecoveryScreen from "./components/RecoveryScreen";

export default function RouteError({ error, reset }) {
  return <RecoveryScreen error={error} reset={reset} boundary="route" />;
}
