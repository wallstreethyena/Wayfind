// app/go/florida/layout.js — puts the display face (Fraunces, --wf-display) in scope for
// /go/florida, and makes next/font preload it there. See app/fontsDisplay.js.
import { DisplayFontScope } from "../../fontsDisplay";

export default function GoFloridaLayout({ children }) {
  return <DisplayFontScope>{children}</DisplayFontScope>;
}
