# OnionPod

OnionPod is a podcast player for Android and the web. Search the Apple podcast directory, open a public HTTPS RSS or Atom feed, follow shows, and build a listening queue. The player supports seeking, speed changes, and resuming episodes. The library, queue, and listening progress are saved locally.

## Web

Install Node.js 22 or later. From the repository root:

```sh
node server.mjs
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). No npm install or API credentials are required. Run `node --test` for the web and feed relay checks.

The Node server retrieves directory results and public feeds because browsers cannot read every publisher's feed directly. Audio streams directly from the publisher. The server binds to loopback by default. Use a Node host with HTTPS and request limits when deploying the web app.

## Android

Open the repository root in Android Studio. Install Android SDK Platform 37 and Build Tools 36.0.0. Use Android Studio's bundled JDK or JDK 17 or later for Gradle. Run `android-app` on an Android 7.0 (API 24) or newer device or emulator with an updated Android System WebView.

With `JAVA_HOME` and `ANDROID_HOME` configured, build and lint from the root:

```powershell
.\gradlew.bat :android-app:assembleDebug :android-app:lintDebug
```

On macOS or Linux use `./gradlew` in place of `.\gradlew.bat`. The debug APK is at `android-app/build/outputs/apk/debug/android-app-debug.apk`.

Android packages the shared interface locally and accesses feeds directly. Media3 runs the active episode in a playback service and exposes Android media controls. Download episodes from their episode lists and play completed downloads from the Downloads tab. Use a device to verify lock-screen controls, audio focus, background playback and offline playback before release. Queue auto-advance currently depends on the app screen being active on Android.

## Project layout

- `web/` contains the shared HTML, CSS, and JavaScript. It has no framework or build step.
- `server.mjs` serves the web interface and relays directory and feed requests.
- `android-app/` packages the interface in a WebView and handles native playback and downloads.

The shared interface keeps product behavior consistent. Native Android code keeps playback independent of the screen for an active episode and uses the system download manager. Each installation maintains its own data. See [AGENTS.md](AGENTS.md) for contributor guidance.
