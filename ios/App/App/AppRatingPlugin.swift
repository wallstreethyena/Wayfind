import Capacitor
import StoreKit
import UIKit

// AppRatingPlugin — the native "would you rate Wayfind?" sheet.
//
// StoreKit, not a link to the App Store. SKStoreReviewController shows an
// in-app sheet the user can dismiss in one tap; a link would eject them from
// the app to write a review, which is both a worse experience and a much worse
// conversion rate.
//
// TWO THINGS APPLE ENFORCES AND ONE IT DOES NOT:
//   - The system shows this AT MOST three times per app per 365 days, and
//     silently no-ops after that. There is no callback and no error, so a
//     caller can never know whether anything appeared. That is deliberate on
//     Apple's part and it is why the JS side keeps its own throttle rather
//     than relying on this one.
//   - It must not be attached to a "Rate this app" button. The prompt is
//     supposed to arrive at a natural high point, unrequested. lib/appRating.js
//     fires it after a COMPLETED SHARE, which is the moment the user has just
//     recommended Wayfind to somebody else.
//   - What Apple does NOT enforce: prompting a brand-new user on their first
//     positive action. That is legal and it is how apps earn one-star "stop
//     asking me" reviews. The gating lives in JS.
@objc(AppRatingPlugin)
public class AppRatingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppRatingPlugin"
    public let jsName = "AppRating"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise)
    ]

    @objc public func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // The scene is required on iOS 14+. Resolving it from the plugin's
            // own window rather than a global keeps this correct if the app
            // ever runs more than one scene.
            let scene = self.bridge?.viewController?.view.window?.windowScene
                ?? UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .first { $0.activationState == .foregroundActive }

            guard let windowScene = scene else {
                // Resolve rather than reject: a missing scene means the app is
                // backgrounding, which is not an error the JS caller can act
                // on. Every path here is best-effort by design.
                call.resolve(["requested": false, "reason": "no-active-scene"])
                return
            }

            SKStoreReviewController.requestReview(in: windowScene)
            // "requested", never "shown". Apple gives no signal about whether
            // the sheet actually appeared, and reporting otherwise would be a
            // claim this code cannot support.
            call.resolve(["requested": true])
        }
    }
}
