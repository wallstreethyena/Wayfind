// Landing is needed only after a tap. Keep the settlement engine off the first
// screen, while preserving its cancellable contract for both callers.
export function landOnResults(getTarget, opts) {
  let stopped = false;
  let cancel = () => {};
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    if (typeof opts?.onDone === "function") opts.onDone();
  };
  import("./landOnResults.js").then(({ landOnResults: start }) => {
    if (stopped) return;
    cancel = start(getTarget, { ...opts, onDone: done });
  }, done);
  return () => {
    stopped = true;
    cancel();
    done();
  };
}
