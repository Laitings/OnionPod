# OnionPod

OnionPod is a podcast player for Android and the web. Search the Apple podcast directory, open a public HTTPS RSS or Atom feed, follow shows, and build a listening queue. The player supports seeking, speed changes, and resuming episodes. The library, queue, and listening progress are saved locally.

## Web

Install Node.js 22.13 or later. From the repository root:

```sh
node server.mjs
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). No npm install or API credentials are required for local browsing. Run `node --test` for the web, feed relay, and account sync checks.

The Node server retrieves directory results and public feeds because browsers cannot read every publisher's feed directly. Audio streams directly from the publisher. The server binds to loopback by default. Use a Node host with HTTPS and request limits when deploying the web app.

## Private sync staging on Synology

Use the existing Container Manager project and keep the `OnionPod Private` reverse-proxy profile in place during testing. The Node container's host port should stay bound to `127.0.0.1:4173`. The app reads these environment variables:

- `DATA_DIR=/data` enables sync and protects the web search and feed relay with sign-in. Back up the persistent directory with a SQLite-aware backup or stop the container before copying it. Sessions and sync state are stored in `onionpod.sqlite3`.
- `PUBLIC_ORIGIN=https://podcasts.example.com` sets the browser origin allowed to sign in and exchange data. Set it to your actual HTTPS address without a trailing slash or path. Pass the same origin with `-PonionpodSyncOrigin=https://podcasts.example.com` when building the Android app.

After deploying the code to private staging, provision the single owner account inside the running container. Substitute the service name from `docker compose -f /volume1/docker/onionpod/compose.yaml config --services`:

```sh
docker compose -f /volume1/docker/onionpod/compose.yaml exec SERVICE node sync-admin.mjs
```

Save the generated password in a password manager. Using `node sync-admin.mjs --rotate` replaces the password and revokes all sessions without deleting follows or progress. The app has no public account registration.

Open **Sync** on the web and Android and sign in with the same password. The first sign-in imports existing follows and listening positions. Both apps keep local changes and retry when they can reach the server. Android also uploads playback checkpoints while its playback service runs. The latest dated update wins, so a recent rewind or unfollow is preserved. Queue, download files, and new episode badge counts stay on each device.

**Continue Listening** on Discover resumes your most recent unfinished episode. With sync enabled, it includes playback from the other device. Tap the × on a card to remove it from the list on both devices; your position is kept, and the episode returns if you play it again. Update the sync server before the Android app when upgrading, because an older server rejects removals and pauses sync. Existing listening positions are kept when the server adds episode metadata to its database.

**Suggested for you** on Discover compares words in the descriptions and recent episode titles of up to ten followed shows (most recently played first) with shows found by searching the directory for those words. Each card names the followed show it resembles. The matching runs on the device, filters English and Norwegian filler words, and is refreshed daily or when your follows change. The first run reads several dozen feeds, so it can take a while and use noticeable mobile data.

Episodes played to within 30 seconds of the end are tinted blue and marked **Listened**. Use **Hide listened** on a podcast page to leave them out; the choice is saved per device. Seeking back to the very start of an episode also records it this way.

**Inbox** shows new episodes from followed podcasts, newest first. The first feed check establishes a baseline. Play or dismiss an episode to clear it from this device’s inbox. Opening the podcast clears its badge and keeps the episode in the inbox.

Podcast pages show **Upcoming** when the feed lists a future release. Future-dated episodes become eligible for the episode list and new episode counts on feed checks after their release time. When the feed gives no upcoming date, a consistent recent daily, weekday, weekly, or every-other-week schedule may appear as an estimate.

Tap the heart on an episode card to save it under **Library → Favorites**. Favorites are saved on the device where you add them.

Before making the site reachable from mobile data, verify that a signed-out request to `/api/search?q=podcast` and `/api/feed?url=https://example.com/feed.xml` receives HTTP 401 from OnionPod on an allowed network. In private staging, test follow and unfollow in both directions, then pause an episode on Android and resume it on the web. Verify Movie Tracker still works. Repeat the phone test over mobile data after the NAS access profile is deliberately opened.

## Android

Open the repository root in Android Studio. Install Android SDK Platform 37 and Build Tools 36.0.0. Use Android Studio's bundled JDK or JDK 17 or later for Gradle. Run `android-app` on an Android 7.0 (API 24) or newer device or emulator with an updated Android System WebView.

With `JAVA_HOME` and `ANDROID_HOME` configured, build and lint from the root:

```powershell
.\gradlew.bat :android-app:assembleDebug :android-app:lintDebug
```

On macOS or Linux use `./gradlew` in place of `.\gradlew.bat`. The debug APK is at `android-app/build/outputs/apk/debug/android-app-debug.apk`.

Android packages the shared interface locally and accesses feeds directly. Media3 runs playback in a service and exposes Android media controls. When an episode finishes, the service starts the next queued episode even if the app is in the background or the screen is locked. Downloaded episodes play from their local file. Download episodes from their episode lists and play completed downloads from the Downloads tab.

When Android pauses playback after an audio output disconnects, OnionPod rewinds by five seconds so you hear that part again when you press Play. Alerts that temporarily take audio focus resume playback at the same position when the alert releases focus.

## Project layout

- `web/` contains the shared HTML, CSS, and JavaScript. It has no framework or build step.
- `server.mjs` serves the web interface and relays directory and feed requests.
- `android-app/` packages the interface in a WebView and handles native playback and downloads.

The shared interface keeps product behavior consistent. Native Android code keeps playback independent of the screen for an active episode and uses the system download manager. See [AGENTS.md](AGENTS.md) for contributor guidance.
