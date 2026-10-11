/**
 * The phone apps (see docs/mobile.md): Capacitor wraps the release build
 * (`dist/`, from `vite build`) in a native app for Android (`android/`) and
 * iOS (`ios/`). The game runs from the files inside the app, offline.
 */
import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.sandromaglione.spiritcall",
  appName: "Spirit Call",
  webDir: "dist",
  // The page's own colour while it starts, as on the web (index.html).
  backgroundColor: "#0d1117",
  ios: { contentInset: "never" }
}

export default config
