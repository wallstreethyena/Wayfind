# Map detail return checkpoint

Goal: a nearby map stays on the reader's category, subcategory and searched city after opening a pin's details and pressing Back. Preserve the 9.2 floor, score ordering, provider provenance and existing request caps.

On production revision `8eefaf4f`, the Tampa Night out map showed 13 pins, with count-only diagnostics reporting seven Apple searches, six recovered places, one rejected match and no service errors or timeouts. The count survived filter switching and photo loading. Existing recovery therefore works; this change does not replace it.

The remaining direct-flow defect was reproduced on Parrish Food > Cafés: a real Ryan's Coffee House pin opened its preview, the name opened the correct details, and Back changed the underlying map to Activities > All. The URL stayed `/map` throughout. A second Tampa detail flow showed the same reset.

The shell's shared popstate handler restored a persisted entry even when merely closing an overlay over the still-mounted map. That can replace its current filters and center with an older snapshot. The exact reason the snapshot was stale has not been established. The fix records the exact entry beneath the detail sheet and bypasses snapshot restoration only for that return, updating the active-entry bookkeeping. Real screen navigation and standalone place-route returns keep their existing restoration behavior.

`check-position-memory.mjs` executes the actual shell history effects and restoration functions against browser-shaped history. It covers native and in-app Back, both observed taxonomy families, location preservation, ordinary next-screen Back and standalone place double-Back. Removing the parent-entry guard reproduces the filter reset and fails the regression. Existing browse-history, position-memory and Apple hook checks plus JSX validation also passed locally.

Release gates remain the hosted full suite/build and a deployed replay of the direct pin > details > Back flow. This checkpoint does not claim deployed verification of the new fix. Apple Place ID migration remains declared pending; the live Search path is capped per mount, not guaranteed by a strict shared daily ceiling. No coordinate storage, provider, score or request logic changes in this follow-up.

## Deployed failure and router-level follow-up

Production `31decddf` still reset Parrish Food > Cafés to Activities > All on the same direct pin > name > details > Back flow. The parent-entry guard passed its isolated regression but did not cover Next's independent router listener, so it was insufficient and is not recorded as a live fix.

The startup ordering exposes the actual failure: Next initializes its history marker and route tree during insertion effects; DocumentPosition wraps history in a layout effect; Home's child passive effect rewrites `/?go=map` to `/map` before the parent Next router installs its passive-effect history patch. That rewrite supplied only `{ wf: "screen" }`, and DocumentPosition discarded Next's `__NA` and `__PRIVATE_NEXTJS_INTERNALS_TREE`. Next's Back listener reloads an entry without its marker, losing the mounted map despite the shell's return guard.

DocumentPosition now carries forward only these framework-owned fields when the caller omits them. Explicit framework updates still win, and new entries do not inherit unrelated shell state. The earlier shell guard remains relevant to snapshot restoration, but is not a substitute for preserving the router's history contract. The follow-up must pass a real React/Next lifecycle regression and repeat the deployed direct-flow acceptance before the task is considered complete.

`test-map-router-return.mjs` mounts the installed production Next AppRouter and real DocumentPosition component with ReactDOM in jsdom. A small shell fixture executes the actual Home handoff and detail-history effects extracted from source. The fixed wrapper yields one Next traversal, zero reload requests, one shell mount and preserved Food/Cafés/Parrish state. Replacing both repaired wrappers with their original state copying yields missing Next metadata and one reload request instead of traversal. This covers real effect ordering and router behavior; it is not a full Home or live MapKit test. jsdom is a development-only dependency; no existing dependency versions changed. Existing document-position tests also verify explicit framework updates and isolation of unrelated entry state.
