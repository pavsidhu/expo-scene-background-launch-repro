import Expo
import ExpoModulesCore
import React

/// Workaround: under the UIScene life cycle Expo starts React Native only from
/// `ExpoAppSceneDelegate.scene(_:willConnectTo:options:)`. When iOS launches the app in the
/// background (BGTaskScheduler, background fetch, silent push and so on) it connects no scene,
/// so no JS runs and expo-task-manager tasks never execute.
///
/// If React Native still hasn't started shortly after launch, start the React host without a
/// view. When a scene connects later, `startReactNative` reuses the running host and only adds
/// a surface (`RCTRootViewFactory` creates the host only if it doesn't exist yet).
public class BackgroundLaunchAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  /// How long to give UIKit to connect a scene (and start React Native) on a normal launch.
  private static let gracePeriod: TimeInterval = 2

  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.gracePeriod) {
      guard let provider = UIApplication.shared.delegate as? ExpoReactNativeFactoryProvider,
        let factory = provider.reactNativeFactory,
        factory.rootViewFactory.reactHost == nil else {
        return
      }
      NSLog(
        "[BackgroundLaunch] React Native not started %.0fs after launch (connected scenes: %d); starting the React host without a view.",
        Self.gracePeriod,
        UIApplication.shared.connectedScenes.count
      )
      // Note: apps using expo-updates must also start its `AppController` first so the host
      // loads the right launch asset. This minimal repro doesn't use expo-updates.
      // `defaultConfiguration` returns nil in Release builds, but Swift requires a value here.
      let devMenuConfiguration: RCTDevMenuConfiguration? =
        factory.devMenuConfiguration ?? RCTDevMenuConfiguration.default()
      factory.rootViewFactory.initializeReactHost(
        launchOptions: launchOptions,
        bundleConfiguration: factory.bundleConfiguration,
        devMenuConfiguration: devMenuConfiguration ?? RCTDevMenuConfiguration()
      )
    }
    return false
  }
}
