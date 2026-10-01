// app/culture/layout.js — puts the display face (Fraunces, --wf-display) in scope for
// every /culture/[metro] page, and makes next/font preload it there. See app/fontsDisplay.js.
import { DisplayFontScope } from "../fontsDisplay";

export default function CultureLayout({ children }) {
  return <DisplayFontScope>{children}</DisplayFontScope>;
}
