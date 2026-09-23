import UIKit
import WebKit
import Capacitor

final class WayfindBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // registerPluginType is intentionally a no-op while Capacitor's
        // package auto-registration is enabled. These app-owned plugins are
        // not in packageClassList, so register each instance explicitly.
        bridge?.registerPluginInstance(AppleSignInPlugin())
        precondition(bridge?.plugin(withName: "AppleSignIn") != nil,
                     "AppleSignIn plugin registration failed")

        // AppRatingPlugin (jsName "AppRating") was never registered anywhere
        // before 2026-09-23 — every call from lib/appRating.js resolved to
        // nothing and failed silently into its own catch. Same instance
        // registration + precondition pattern as AppleSignIn above, so a
        // registration failure crashes at launch instead of shipping a
        // rating prompt that can never fire.
        bridge?.registerPluginInstance(AppRatingPlugin())
        precondition(bridge?.plugin(withName: "AppRating") != nil,
                     "AppRating plugin registration failed")

        // NATIVE LOCATION, NOT A WEBSITE PROMPT (2026-09-23, found in the
        // simulator run). The site calls navigator.geolocation, and inside
        // WKWebView that shows Safari's own sheet: "www.gowayfind.com would
        // like to use your current location... This website will use...".
        // In an App Store app that reads as a website in a frame (guideline
        // 4.2) and it can re-ask every session. This document-start script
        // routes navigator.geolocation (and permissions.query for
        // geolocation) through the official Capacitor Geolocation plugin, so
        // the only prompt anyone ever sees is iOS's native one, worded by
        // NSLocationWhenInUseUsageDescription. It is added after Capacitor's
        // own bridge scripts (capacitorDidLoad runs after the bridge exports
        // them), so window.Capacitor.Plugins.Geolocation already exists when
        // it runs. If the plugin is missing it changes nothing.
        webView?.configuration.userContentController.addUserScript(
            WKUserScript(source: WayfindBridgeViewController.geolocationShim,
                         injectionTime: .atDocumentStart,
                         forMainFrameOnly: true))
    }

    // Executed by scripts/check-ios-shell-wiring.mjs (extracted between the
    // markers and run against a fake Capacitor plugin), so keep it plain ES5.
    static let geolocationShim = #"""
    // WF_GEO_SHIM_BEGIN
    (function () {
      try {
        var C = window.Capacitor;
        var G = C && C.Plugins && C.Plugins.Geolocation;
        if (!G || !C.isNativePlatform || !C.isNativePlatform()) return;
        var ERR = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
        function toError(e) {
          var msg = String((e && e.message) || e || "Location unavailable");
          var code = /denied|permission|not authorized/i.test(msg) ? 1 : (/timeout|timed out/i.test(msg) ? 3 : 2);
          return { code: code, message: msg, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
        }
        function toPosition(p) {
          var c = (p && p.coords) || {};
          return {
            coords: {
              latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy,
              altitude: c.altitude == null ? null : c.altitude,
              altitudeAccuracy: c.altitudeAccuracy == null ? null : c.altitudeAccuracy,
              heading: c.heading == null ? null : c.heading,
              speed: c.speed == null ? null : c.speed
            },
            timestamp: (p && p.timestamp) || Date.now()
          };
        }
        function opts(o) {
          o = o || {};
          var out = { enableHighAccuracy: !!o.enableHighAccuracy };
          if (typeof o.timeout === "number" && isFinite(o.timeout)) out.timeout = o.timeout;
          if (typeof o.maximumAge === "number" && isFinite(o.maximumAge)) out.maximumAge = o.maximumAge;
          return out;
        }
        var seq = 0, native = {}, cleared = {};
        var geo = {
          getCurrentPosition: function (ok, fail, o) {
            G.getCurrentPosition(opts(o)).then(function (p) { if (ok) ok(toPosition(p)); },
              function (e) { if (fail) fail(toError(e)); });
          },
          watchPosition: function (ok, fail, o) {
            var id = ++seq;
            G.watchPosition(opts(o), function (p, e) {
              if (cleared[id]) return;
              if (e) { if (fail) fail(toError(e)); return; }
              if (p && ok) ok(toPosition(p));
            }).then(function (nid) {
              native[id] = nid;
              if (cleared[id]) G.clearWatch({ id: nid });
            }, function (e) { if (fail) fail(toError(e)); });
            return id;
          },
          clearWatch: function (id) {
            cleared[id] = true;
            if (native[id]) { G.clearWatch({ id: native[id] }); delete native[id]; }
          }
        };
        Object.defineProperty(navigator, "geolocation", { value: geo, configurable: true });
        var perms = navigator.permissions;
        var origQuery = perms && perms.query ? perms.query.bind(perms) : null;
        var q = function (d) {
          if (d && d.name === "geolocation" && G.checkPermissions) {
            return G.checkPermissions().then(function (r) {
              var st = r && r.location;
              var state = st === "granted" ? "granted" : (st === "denied" ? "denied" : "prompt");
              return { name: "geolocation", state: state, onchange: null };
            });
          }
          return origQuery ? origQuery(d) : Promise.reject(new TypeError("permissions unsupported"));
        };
        if (perms) { try { perms.query = q; } catch (e1) {} }
        else { Object.defineProperty(navigator, "permissions", { value: { query: q }, configurable: true }); }
        window.__wfNativeGeo = true;
      } catch (e) {}
    })();
    // WF_GEO_SHIM_END
    """#
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = WayfindBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
