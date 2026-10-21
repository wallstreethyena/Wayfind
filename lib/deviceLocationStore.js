import { normalizeCoordinates } from './deviceDistance.js';

export const DEVICE_LOCATION_MAX_AGE_MS = 60_000;

// Environment injection keeps permission, clock, and watch lifecycle testable.
// The default environment is resolved lazily: importing this module during SSR
// neither touches browser globals nor creates a location request.
export function createDeviceLocationStore(environment) {
  let snapshot = null;
  let watchId = null;
  let expiry = null;
  let env = null;
  let generation = 0;
  let activationGeneration = 0;
  let denied = false;
  let permission = null;
  const listeners = new Set();
  const getServerSnapshot = () => null;
  const getSnapshot = () => snapshot;
  function publish(next) {
    if (snapshot === next) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  }
  function clearExpiry() {
    if (expiry !== null) env.clearTimeout(expiry);
    expiry = null;
  }
  function stopWatch() {
    generation++;
    if (watchId !== null && watchId !== -1) env.navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearExpiry();
    publish(null);
  }
  function refreshAfter(delay) {
    clearExpiry();
    expiry = env.setTimeout(() => {
      expiry = null;
      stopWatch();
      startWatch();
    }, delay);
  }
  function startWatch() {
    if (!env?.navigator?.geolocation || denied || watchId !== null || !listeners.size || env.document?.visibilityState === 'hidden') return;
    const current = ++generation;
    // Reserve the watch before invoking the browser, including synchronous fakes.
    watchId = -1;
    try {
      const id = env.navigator.geolocation.watchPosition(position => {
        if (current !== generation || !listeners.size) return;
        clearExpiry();
        const coords = normalizeCoordinates(position?.coords);
        const timestamp = position?.timestamp;
        const age = env.now() - timestamp;
        if (!coords || typeof timestamp !== 'number' || !Number.isFinite(timestamp) || age < -1000 || age >= DEVICE_LOCATION_MAX_AGE_MS) {
          publish(null);
          refreshAfter(DEVICE_LOCATION_MAX_AGE_MS);
          return;
        }
        publish(coords);
        // A stationary watch may never emit again. Renew the watch at expiry
        // rather than leaving an active visitor with a permanently empty fix.
        refreshAfter(DEVICE_LOCATION_MAX_AGE_MS - Math.max(0, age));
      }, error => {
        if (current !== generation) return;
        if (error?.code === 1) { denied = true; stopWatch(); }
        else { stopWatch(); refreshAfter(DEVICE_LOCATION_MAX_AGE_MS); }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
      if (current !== generation) env.navigator.geolocation.clearWatch(id);
      else watchId = id;
    } catch {
      watchId = null;
      publish(null);
      refreshAfter(DEVICE_LOCATION_MAX_AGE_MS);
    }
  }
  function visibilityChanged() {
    if (env.document?.visibilityState === 'hidden') stopWatch();
    else startWatch();
  }
  function permissionChanged() {
    denied = permission?.state === 'denied';
    if (denied) stopWatch();
    else startWatch();
  }
  function activate() {
    const browser = typeof window !== 'undefined';
    env = environment || { navigator: browser ? window.navigator : null, document: browser ? window.document : null,
      // Call timers as globals: copying Window methods here would pass `env`
      // as their receiver and throw "Illegal invocation" in browser callbacks.
      now: Date.now,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: id => clearTimeout(id) };
    denied = false;
    env.document?.addEventListener('visibilitychange', visibilityChanged);
    const activation = ++activationGeneration;
    // Observe revocation as well as watch errors, without requiring Permissions API.
    try {
      Promise.resolve(env.navigator?.permissions?.query({ name: 'geolocation' })).then(result => {
        if (!result || !listeners.size || activation !== activationGeneration) return;
        permission = result;
        permission.addEventListener?.('change', permissionChanged);
        // Do not let a delayed "granted" query undo a newer watch denial.
        if (permission.state === 'denied') permissionChanged();
      }).catch(() => {});
    } catch { /* Geolocation itself remains authoritative on older browsers. */ }
    startWatch();
  }
  function subscribe(listener) {
    listeners.add(listener);
    if (listeners.size === 1) activate();
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      activationGeneration++;
      stopWatch();
      env.document?.removeEventListener('visibilitychange', visibilityChanged);
      permission?.removeEventListener?.('change', permissionChanged);
      permission = null;
    };
  }
  return { subscribe, getSnapshot, getServerSnapshot };
}

export const deviceLocationStore = createDeviceLocationStore();
