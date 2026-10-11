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

CI (`.github/workflows/apps.yml`) builds both on every pull request: the
Android debug APK, kept as the run's artifact (download it and install it
on a phone), and an unsigned iOS build for the simulator.

A playtest app is a playtest build like any other (see `docs/playtest.md`):
build with `PLAYTEST_KEY` and `PLAYTEST_URL` (the playtest server's address)
set. The server accepts runs from the apps' origins (`src/server/http.ts`).
Without them the app is a release build and sends nothing.

Signing and the store listings come later (see the mobile plan).
