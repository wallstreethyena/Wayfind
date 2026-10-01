// app/components/ExploreBridgeGate.js — server wrapper for ExploreBridge.
//
// Emits the pre-paint arm script and the gate CSS IMMEDIATELY BEFORE the
// bridge's server-rendered markup, so the parser has set
// <html data-wf-bridge> by the time it reaches the block. See
// lib/exploreBridgeGate.js for why (issue #1602: the treatment used to be
// inserted at hydration and shove the guide down under the reader).
// A server component on purpose: React never renders these tags on the client.
import ExploreBridge from "./ExploreBridge";
import { EXPLORE_BRIDGE_GATE_CSS, exploreBridgeGateScript } from "../../lib/exploreBridgeGate";

export default function ExploreBridgeGate(props) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: EXPLORE_BRIDGE_GATE_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: exploreBridgeGateScript() }} />
      <ExploreBridge {...props} />
    </>
  );
}
