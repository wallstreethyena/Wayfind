import UIKit
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
    }
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
