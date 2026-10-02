// app/command-center/layout.js — puts the display face (Fraunces, --wf-display) in scope for
// the Command Center, and makes next/font preload it there. See app/fontsDisplay.js.
import { DisplayFontScope } from "../fontsDisplay";

export default function CommandCenterLayout({ children }) {
  return <DisplayFontScope>{children}</DisplayFontScope>;
}
