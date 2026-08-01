import UIKit
import Capacitor

final class WayfindBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // registerPluginType is intentionally a no-op while Capacitor's
        // package auto-registration is enabled. This app-owned plugin is not
        // in packageClassList, so register the instance explicitly.
        bridge?.registerPluginInstance(AppleSignInPlugin())
        precondition(bridge?.plugin(withName: "AppleSignIn") != nil,
                     "AppleSignIn plugin registration failed")
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
