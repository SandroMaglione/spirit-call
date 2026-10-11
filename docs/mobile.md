# The phone apps

Spirit Call ships on Android and iOS as the same game the browser plays:
[Capacitor](https://capacitorjs.com) wraps the release build (`dist/`, from
`vite build`) in a native app whose web view runs it from the files inside
the app, offline. Nothing in the simulation, the presentation, or the menus
knows it is in an app.

- `capacitor.config.ts`: the app's id (`com.sandromaglione.spiritcall`),
  its name, and where the build is (`dist`).
- `android/` and `ios/`: the native projects (Android Studio and Xcode),
  kept in the repository. What a sync writes into them (the game's files,
  the plugins' paths) is gitignored or rewritten on every sync.
- `src/app/storage.ts`: the one place the app differs. In the app the
  account and settings are kept by the Preferences plugin (the app's own
  storage); in a browser, in local storage.
- Both apps are landscape only and fill the screen (no status bar; on
  Android no navigation bar either, a swipe from the edge shows it for a
  moment), and keep the screen on while the game is open
  (`MainActivity.java`, `AppDelegate.swift`).
- `src/app/device.ts`: what the apps do that a browser does not, as plain
  functions `main.ts` calls: the splash screen stays until the game shows
  the list of accounts (`hideSplash`), buzzes are taps of the phone's motor
  through the Haptics plugin (iPhones have no `navigator.vibrate`), and
  Android's back button is Escape (steps back in the menus, closes a
  dialog, pauses and resumes a run; it never closes the app).
- Sound that a call or another app interrupted comes back on the next tap.

## Icons and the splash screen

The sources are in `assets/` (made from `public/icons/icon-1024.png`):
`icon-only.png` (iOS, and Android before adaptive icons),
`icon-foreground.png` and `icon-background.png` (Android's adaptive icon),
and `splash.png` and `splash-dark.png` (the icon on the game's dark
background). `pnpm app:assets` makes every size both apps need from them;
run it after changing one, and commit what it writes in `android/` and
`ios/`. Android 12 and later draw their own splash from the app's icon, on
the dark background set in `android/app/src/main/res/values/styles.xml`.

## Building

- `pnpm app`: builds the game and copies it into both native projects
  (`cap sync`). Run it after every change to the game, before building an
  app.
- `pnpm app:android`, `pnpm app:ios`: the same, then opens Android Studio or
  Xcode, to run on a phone or an emulator. iOS needs a Mac with Xcode;
  Android needs Android Studio (or the Android SDK and Java 21).
- From the command line: `cd android && ./gradlew assembleDebug` makes an
  installable APK at `android/app/build/outputs/apk/debug/app-debug.apk`.

Native builds and device checks run locally, only for the platform needed.
GitHub runs the general checks and makes no app artifacts. See
[local-workflows.md](local-workflows.md) for command-line Android and iOS
builds. Install and open the app on a phone or emulator before release.

Only a debug build may reach the network (the internet permission is in
`android/app/src/debug/AndroidManifest.xml`): it loads a dev server, or
sends a playtest app's runs. The store build asks for no permissions at
all, since the game runs from the files in the app and sends nothing.

A playtest app is a playtest build like any other (see `docs/playtest.md`):
build with `PLAYTEST_KEY` and `PLAYTEST_URL` (the playtest server's address)
set. The server accepts runs from the apps' origins (`src/server/http.ts`).
Without them the app is a release build and sends nothing.

## Releasing on Google Play

Google Play takes an Android App Bundle (`.aab`) signed with the app's
upload key; with Play App Signing, Google keeps the key the app is finally
signed with, and a lost upload key can be replaced. The upload key is never
in the repository. Keep the existing key and its passwords in protected
local storage; use the same key for every upload of this app.

1. For a new app only, make the upload key once on your own computer.
   Keep the file and its passwords safe. Java's `keytool` comes with
   Android Studio:
   `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. Load `UPLOAD_KEYSTORE`, the absolute path to that file,
   `UPLOAD_KEYSTORE_PASSWORD`, `UPLOAD_KEY_ALIAS`, and `UPLOAD_KEY_PASSWORD`
   into your local build environment from protected storage. Do not put
   passwords in commands, commits, or chat. `android/app/build.gradle`
   reads these variables; without a key a release build is unsigned.
3. Build from a clean worktree using the published engine, as described in
   [local-workflows.md](local-workflows.md), then run `pnpm build` and
   `pnpm exec cap sync android`.
4. Check the highest uploaded version code in Play Console and choose a
   higher `VERSION_CODE`. Version 11 was released on October 11, 2026;
   the next upload must be at least 12, or higher if another upload has
   happened since. From `android/`, run:

   ```sh
   VERSION_CODE=12 VERSION_NAME=0.1.0 ./gradlew bundleRelease assembleRelease
   ```

5. Install the signed release APK at
   `android/app/build/outputs/apk/release/app-release.apk`, relative to the
   worktree root, and verify it starts and plays correctly. Upload
   `android/app/build/outputs/bundle/release/app-release.aab` to Play
   Console, review the release, and publish it to Internal testing.

There is no GitHub signing or automatic version counter. Preserve the
local upload key backup; the former GitHub secrets are not used by checks.

The listing's graphics are in `store/google-play/`: the 512 icon, the
1024x500 feature graphic, and landscape phone screenshots at 1920x1080. The
feature graphic is a dev-only page, `/tools/store/` on the dev server
(`tools/store/`): the five element spirits (cut out of
`art/spirits/<element>/renders/hero.png` into `tools/store/spirits/`) over
the menu's element emblems, screenshotted at 1024x500. The screenshots are
the game itself on a 960x540 screen at twice its pixels, the fights from a
dev build (`?play&touch&team=...&challenge=...&wave=3&charged`, the
on-screen controls in use, the ultimates set off from their button). Settings, About, lists the open-source packages
the game contains with their licenses (`scripts/licenses.ts` writes them
into the build as `licenses.json`).
