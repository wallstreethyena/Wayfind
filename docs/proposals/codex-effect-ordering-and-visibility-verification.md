# Proposal — two rules from the intro-gate lane: read the LANDING url, and prove the browser state you claim to have tested

- **Lane:** codex (Wayfind lane)
- **Target file if adopted:** `CLAUDE.md`. Rule 1 belongs with the "the check ran and answered
  a question you were not asking" family. Rule 2 belongs directly beneath "Mobile verification
  means a real 390px viewport", which it generalises.
- **Origin:** PR #590 (2026-08-04/05), the 2-minute / once-per-device intro gate.
- **Status:** awaiting owner adoption. Not in force until it lands in `CLAUDE.md` under an
  owner commit.

Both rules come from defects found in a **browser**, by checks that no guard in this repo
would have caught. That is the reason to write them down: 259 guards, `check:jsx` and
`next build` were all green across both.

---

## Rule 1 — an effect that reads the URL may be reading a URL an earlier effect already rewrote

### The rule, verbatim, ready to paste

#### `window.location.search` inside an effect is not the URL the visitor landed on

Several effects in `app/home.js` rewrite the query string with `history.replaceState` as soon
as their precondition is met — the `?q` handler clears it once `center` is known, the `?place`
handler deletes its own params, the OAuth handler strips `code=`. **React runs effects in
declaration order within a commit.** So any effect declared *below* one of those, reading
`window.location.search`, can legitimately observe a URL that has already been stripped.

The failure is silent and **conditional on user state**, which is what makes it expensive: on
a first-ever visit `center` is null, the strip does not run, and the later effect sees the full
URL and behaves correctly. On a **returning** visit with a saved `wf_center`, the strip runs in
the first commit and the later effect sees a bare `/`. The code is identical; the behaviour
differs by whether the visitor has been here before — so it survives every test written against
a clean profile. This is the same shape as the warm-cache rule already in `CLAUDE.md`: correct
code, stale-or-mutated client state, green tests.

Measured instance: the intro auto-show's deep-link and paid-traffic exemptions read
`window.location.search` inside their own effect. Returning visitors arriving on a deep link or
a **paid ad** were served the mood gate anyway — precisely the traffic `6cb95ec` exists to
protect, and precisely the traffic whose interruption the change was measured to be costing
money on.

**If a decision depends on the URL the visitor arrived at, capture it during RENDER**, which
precedes every effect:

```js
const landingSearchRef = useRef(typeof window === "undefined" ? "" : window.location.search);
```

and read `landingSearchRef.current` from then on. Where a guard protects such a decision, assert
that the effect does **not** contain the substring `window.location.search` at all — the
presence of the captured ref is not sufficient, because both can coexist.

Generalises beyond the URL: **any effect reading mutable global state (`location`, `document.title`,
`document.cookie`, a DOM measurement) is reading it at effect time, not at mount time, and an
earlier-declared effect is allowed to have changed it.** "The value at the moment the component
appeared" and "the value when my effect ran" are different questions.

### Why it is worth adopting

The repo already has strong rules about guards asking the wrong question. This is the runtime
version: the *code* asks the wrong question, and no static check can see it, because reading
`window.location.search` is correct in isolation and only wrong relative to sibling declaration
order. It cost a revenue-path regression that four separate green signals missed.

---

## Rule 2 — the harness does not put the browser in the state you assume; assert the state, or the test proves nothing

### The rule, verbatim, ready to paste

#### Assert the browser STATE you are testing, not just the action you took

`CLAUDE.md` already records that `resize_window` can report success and leave the viewport at
1512px. That is one instance of a general rule, and the same trap recurred twice in one session
on a different axis:

- **Playwright's `browser_resize` silently reverts on navigation.** It was applied, verified at
  390px, and then a `browser_navigate` put it back to 1200px. Every subsequent screenshot would
  have been desktop evidence labelled mobile. **Re-assert `innerWidth` after every navigation,
  not once per session.**
- **Selecting another tab does NOT hide the first one.** Opening a second Playwright tab and
  waiting three minutes produced **zero** `visibilitychange` transitions on the first — it stayed
  `visible` the entire time. A "backgrounded tab" test written that way exercises the foreground
  path and passes for the wrong reason.

The rule: **record the state transition you are relying on and assert it happened.** Push each
`visibilitychange` into an array and read it back; read `innerWidth` out of the frame; print it.
A test whose premise ("the tab was hidden", "the viewport was 390px") is never verified is not a
weaker test — it is a test of something else entirely, reported under the wrong name.

When the harness genuinely cannot produce the state, **drive the same inputs the code reads** and
say so in the write-up:

```js
let state = "visible";
Object.defineProperty(document, "visibilityState", { get: () => state, configurable: true });
window.__setVis = (s) => { state = s; document.dispatchEvent(new Event("visibilitychange")); };
```

This is legitimate — the listener cannot distinguish it from an OS-level background — but it is
only trustworthy **because the tab-switch approach was first proven to be measuring nothing.**
Reach for the override after the real path fails, never instead of trying it.

Two corollaries from the same session:

- **A dev server reloads pages under you.** An HMR recompile mid-test wiped the recorder and the
  timing origin, and the resulting reading (`elapsed: null`, zero events) was indistinguishable
  from a clean pass. **Set a sentinel (`window.__sentinel = "<run name>"`) and assert it survived**
  before believing any long-running measurement. Prefer `next build && next start` for anything
  that runs longer than a few seconds.
- **Verify storage/privacy behaviour in a real browser, not only against stubs.** A stubbed
  `document.cookie` proves the logic; it does not prove the code runs in a page, that the cookie
  is actually accepted with those attributes, or that a second tab can see it.

### Why it is worth adopting

The existing 390px rule is written as a fact about one tool. The underlying rule — *assert the
state, do not assume the tool produced it* — is what actually transfers, and it caught three
distinct false-verification paths in a single change: a reverted viewport, a never-hidden tab,
and a reloaded page.
