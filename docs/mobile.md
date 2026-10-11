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
- Both apps are landscape only, with no status bar.

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

Signing, store listings, icons and the splash screen come later (see the
mobile plan).
