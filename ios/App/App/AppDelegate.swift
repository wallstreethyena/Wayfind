import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // 2026-09-23 launch hardening: this was the actual reason push
    // registration never resolved (device_push_tokens had 0 rows ever).
    // Capacitor's PushNotifications plugin does not implement these two
    // AppDelegate callbacks itself — it listens for the NotificationCenter
    // posts below (Notification.Name.capacitorDidRegisterForRemoteNotifications
    // / .capacitorDidFailToRegisterForRemoteNotifications, both declared in
    // @capacitor/ios's CAPNotifications.swift) and does nothing until
    // something posts them. Without this, UIApplication.registerForRemoteNotifications()
    // completes silently and the JS "registration" listener in lib/native.js
    // never fires.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // Forwards openURL / continue-userActivity to Capacitor's own
    // ApplicationDelegateProxy, which is how the app plugin's appUrlOpen
    // listener (lib/native.js — Apple/Google OAuth callback, universal
    // links) hears about them. Harmless with UIScene enabled today (iOS
    // routes those calls to SceneDelegate, which already forwards to
    // SceneDelegateProxy), and load-bearing the moment scenes are ever
    // turned off — an app with UIApplicationSceneManifest removed reverts to
    // these AppDelegate entry points, and without this forwarding every deep
    // link and OAuth return would go silently unhandled.
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
