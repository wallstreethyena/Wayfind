// lib/mapTeardown.js — MapLibre cleanup that cannot take down the next route.
//
// THE BUG (WF-007, 2026-08-18): leaving /map for /events threw
//   TypeError: Cannot read properties of undefined (reading 'destroy')
// after a WebGL2 init error. MapLibre's Map.remove() walks painter / gl /
// workers and calls .destroy() on each. A constructor that failed partway
// leaves those fields undefined; an unguarded remove() then throws inside
// React's unmount effect, the app ErrorBoundary paints "That took a wrong
// turn", and /events is unreachable until a full reload.
//
// Cleanup must be idempotent and never throw. A half-initialized map is
// already dead; the next screen is not.

export function safeRemoveMap(map) {
  if (!map) return false;
  if (map._wfRemoved) return false;
  try { map._wfRemoved = true; } catch (e) {}
  try {
    if (typeof map.remove === "function") map.remove();
  } catch (e) {
    // Half-init: painter/gl/style never existed. Swallow — the canvas is gone
    // with the container. A throw here is what crashed /events.
  }
  return true;
}

/** Same crash, without a real MapLibre instance — for the teardown test. */
export function stubFailedWebGLMap() {
  return {
    painter: undefined,
    _removed: false,
    remove() {
      this._removed = true;
      this.painter.destroy();
    },
  };
}
