import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import ts from "typescript";
import { loadComponent } from "./lib/jsxLoad.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const entry = path.join(root, "app/components/SiteFeedback.js");
const { default: SiteFeedback, SiteFeedbackPanel, feedbackPathname } = await loadComponent(entry, root);
const renderRoute = (pathname) => renderToStaticMarkup(createElement(PathnameContext.Provider, { value: pathname }, createElement(SiteFeedback)));

for (const route of ["/guides", "/guides/orlando-date", "/p/ChIJ_place", "/places/cafe", "/restaurants/orlando", "/eat/tampa/italian", "/trending", "/trending-now", "/events/orlando/concert", "/best-of", "/go/florida", "/creators/sam"]) {
  const html = renderRoute(route);
  assert.match(html, />Feedback<\/button>/, route);
  assert.match(html, /aria-expanded="false"/, "each new route starts closed");
  assert.doesNotMatch(html, /<textarea|<form|role="dialog"/, "navigation never opens or traps a form");
}
for (const route of ["/", "", null, "/command-center", "/admin/feedback", "/auth/callback", "/login", "/account", "/favorites", "/itinerary", "/design/beach-review", "/api/feedback", "/unknown", "//example.com/guides"]) {
  assert.equal(renderRoute(route), "", `${route} must not acquire a public feedback overlay`);
}
assert.equal(feedbackPathname("/guides/orlando/?email=private@example.com#token"), "/guides/orlando");
const openHtml = renderToStaticMarkup(createElement(SiteFeedbackPanel, { pathname: "/guides/orlando?token=private-token", onClose() {} }));
assert.match(openHtml, /data-feedback-path="\/guides\/orlando"/);
assert.match(openHtml, /aria-label="Close feedback"/);
assert.match(openHtml, /Your feedback/);
assert.match(openHtml, /<textarea/);
assert.match(openHtml, /Shared with the Wayfind team\. No email required\./);
assert.doesNotMatch(openHtml, /private-token|Instagram|mailto:|role="dialog"/);
assert.equal(renderToStaticMarkup(createElement(SiteFeedbackPanel, { pathname: "/auth/callback" })), "");

// Execute the actual routing function and close callback as well as rendering
// above. React elements preserve keys even though HTML does not expose them.
const source = readFileSync(entry, "utf8");
const ast = ts.createSourceFile(entry, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const routeSource = ts.transpileModule(functions.get("SiteFeedback").replace("export default ", ""), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
let pathname = "/guides/first?token=secret";
const routeView = new Function("React", "feedbackPathname", "usePathname", "FeedbackControl", `${routeSource}; return SiteFeedback;`)(React, feedbackPathname, () => pathname, () => null);
const first = routeView();
assert.equal(first.key, "/guides/first");
assert.equal(first.props.pathname, "/guides/first");
pathname = "/events/orlando/concert";
assert.notEqual(routeView().key, first.key, "changing paths remounts the form and discards its old state");
pathname = "/";
assert.equal(routeView(), null);
let open = true;
let focused = false;
let afterPaint;
const close = new Function("setOpen", "triggerRef", "requestAnimationFrame", `${functions.get("closeFeedback")}; return closeFeedback;`)(
  (value) => { open = value; }, { current: { focus() { focused = true; } } }, (callback) => { afterPaint = callback; },
);
close();
assert.equal(open, false);
assert.equal(focused, false, "focus waits until the previously hidden trigger is visible");
afterPaint();
assert.equal(focused, true);

const layout = readFileSync(path.join(root, "app/layout.js"), "utf8");
assert.match(layout, /<Suspense fallback=\{null\}><SiteFeedback \/><\/Suspense>/, "the actual root layout mounts the route-aware control inside Suspense");
assert.doesNotMatch(source, /beforeunload|popstate|history\.(push|replace)State/, "feedback does not intercept exits or browser navigation");
console.log("test-site-feedback: OK — real public-route rendering, reusable open form, private route exclusions, path-only context, route reset and close focus");
