"use client";
// Last-resort boundary: renders when the root layout itself failed, and
// replaces Next's bare "Application error: a client-side exception has
// occurred" white page (seen on production 2026-09-30 when one app chunk
// answered 502). It supplies its own <html>/<body> because it replaces the
// root layout. The screen, the reload-once rule and the reporting live in
// app/components/RecoveryScreen.js (import-free — see its header for why).
import RecoveryScreen from "./components/RecoveryScreen";

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#040810" }}>
        <RecoveryScreen error={error} reset={reset} boundary="global" />
      </body>
    </html>
  );
}
