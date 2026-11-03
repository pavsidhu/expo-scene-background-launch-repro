# expo-scene-background-launch-repro

Minimal reproduction for an Expo SDK 58 bug on iOS. Under the UIScene life cycle, a background launch connects no scene, so React Native never starts and `expo-task-manager` / `expo-background-task` tasks don't run after the app has been terminated.

Created with `npx create-expo-app@latest --template blank` (Expo SDK 58.0.22, React Native 0.88.1), plus `expo-background-task`, `expo-task-manager` and `expo-file-system`. All the code is in [`App.js`](App.js):

- At module scope, the app appends `js-started` to a log file each time the JS bundle runs. It also defines a task, `record-run`, that appends `task-ran`. Each entry includes a timestamp and `AppState.currentState`.
- On launch it registers the task with `BackgroundTask.registerTaskAsync` and lists the log entries.

## Why

In the SDK 58 template, `AppDelegate` only creates the `ExpoReactNativeFactory`. React Native is started only from `ExpoAppSceneDelegate.scene(_:willConnectTo:options:)` ([`packages/expo/ios/Expo/ExpoAppSceneDelegate.swift`](https://github.com/expo/expo/blob/main/packages/expo/ios/Expo/ExpoAppSceneDelegate.swift)). When iOS relaunches a terminated app in the background to run a `BGTaskScheduler` task, it connects no scene. `BackgroundTaskAppDelegateSubscriber` still calls `EXTaskService.runTasks(...)`, but no JS is running, so no task manager ever registers. In a non-Expo Go app `EXTaskService` has no headless app loader to fall back on, so the event just sits in its queue.

## Steps to reproduce (physical device)

`expo-background-task` turns itself off on the simulator (`BackgroundTaskScheduler.supportsBackgroundTasks()` returns `false` under `targetEnvironment(simulator)`), so this needs a real device.

1. `npm install`, then `npx expo prebuild -p ios`. Set your signing team and build a **Release** configuration to a device with `npx expo run:ios --device --configuration Release`, or use a TestFlight build.
2. Open the app once. You should see one `js-started (AppState: active)` entry. The task is now registered and a `BGProcessingTaskRequest` with the identifier `com.expo.modules.backgroundtask.processing` has been submitted.
3. Terminate the app without force-quitting it. Stop it from Xcode, or let iOS evict it. Don't swipe it away in the app switcher, because iOS generally won't relaunch a force-quit app for background work until the user opens it again.
4. Get iOS to launch the terminated app for the task:
   - **Wait:** leave the device locked, charging and on Wi-Fi (the request requires network connectivity), typically overnight.
   - **Debugger:** in Xcode, set the scheme's Run → Info → Launch option to "Wait for the executable to be launched" and run, so Xcode attaches when iOS launches the app in the background. Once it's attached to a background-launched process, pause, run Apple's [documented](https://developer.apple.com/documentation/backgroundtasks/starting-and-terminating-tasks-during-development) command, then resume:
     ```
     e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.expo.modules.backgroundtask.processing"]
     ```
     Apple notes this only works on devices, and it runs inside an already-running process. If you run it while the app is in the foreground, JS is already running and the task works, so that does **not** reproduce the bug. The bug only shows when the process was launched in the background without a scene.
5. Open the app again and look at the list.

### Expected

A `task-ran` entry (and a `js-started` entry) recorded while the app was in the background, timestamped when iOS ran the task.

### Actual

Nothing is recorded while the app is in the background. The device log shows `EXTaskService: Executing task 'record-run' for app 'mainApplication'.` but no JS runs. If the process is still alive when you reopen the app, the queued event may reach JS then and get recorded with `AppState: active` at the time you opened the app, not when iOS ran the task.

## Emulating a scene-less launch on the simulator

The simulator won't relaunch a terminated app in the background, and it can't run `BGTaskScheduler` tasks at all. To see that nothing starts React Native except the scene delegate, delay `ExpoAppSceneDelegate`'s `willConnectTo` in the generated `ios/<app>/SceneDelegate.swift`. This is a local test-only change and `ios/` is git-ignored:

```swift
internal import Expo
import UIKit

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  override func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    NSLog("[repro-native] scene willConnectTo received; delaying ExpoAppSceneDelegate by 12 s")
    DispatchQueue.main.asyncAfter(deadline: .now() + 12) {
      NSLog("[repro-native] calling ExpoAppSceneDelegate.scene(_:willConnectTo:) now")
      super.scene(scene, willConnectTo: session, options: connectionOptions)
    }
  }
}
```

Release build on an iOS 27 simulator (Xcode 27.2):

```
14:51:09.400 [repro-native] scene willConnectTo received; delaying ExpoAppSceneDelegate by 12 s
14:51:22.001 [repro-native] calling ExpoAppSceneDelegate.scene(_:willConnectTo:) now
14:51:22.463 [repro] js-started (AppState: active)
14:51:22.476 Running "main"
```

No JS runs until the scene delegate starts React Native.

## Workaround

The [`with-workaround`](https://github.com/pavsidhu/expo-scene-background-launch-repro/tree/with-workaround) branch adds a local Expo module, `modules/background-launch`. It's an `ExpoAppDelegateSubscriber` that starts the React host without a view if React Native hasn't started 2 seconds after launch. A scene that connects later reuses that host and adds its surface.
