/**
 * What the phone apps (Capacitor, see docs/mobile.md) do that a browser
 * does not, as plain functions that do the browser's thing (or nothing) in a
 * browser: hiding the splash screen once the game shows, buzzing, and
 * Android's back button.
 */
import { App } from "@capacitor/app"
import { Capacitor } from "@capacitor/core"
import { Haptics, ImpactStyle } from "@capacitor/haptics"
import { SplashScreen } from "@capacitor/splash-screen"

/** Whether the game runs in one of the phone apps. */
export const inApp = Capacitor.isNativePlatform()

/** Takes the app's splash screen away: once the game shows something of its own (or failed to start). */
export const hideSplash = (): void => {
  if (inApp) void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {})
}

/** A tap of the phone's motor, firmer for longer buzzes. */
const impact = (ms: number) => void Haptics.impact({ style: ms < 25 ? ImpactStyle.Light : ms < 50 ? ImpactStyle.Medium : ImpactStyle.Heavy }).catch(() => {})

/**
 * A buzz: milliseconds on, or a pattern of on and off as `navigator.vibrate`
 * takes it. In the apps each "on" is a tap of the motor (iPhones have no
 * `navigator.vibrate`); in a browser, where the phone allows it.
 */
export const buzz = (pattern: number | ReadonlyArray<number>): void => {
  if (!inApp) {
    navigator.vibrate?.(typeof pattern === "number" ? pattern : [...pattern])
    return
  }
  const steps = typeof pattern === "number" ? [pattern] : pattern
  let at = 0
  steps.forEach((ms, index) => {
    if (index % 2 === 0) setTimeout(() => impact(ms), at)
    at += ms
  })
}

/** Calls `back` on Android's back button, which then never closes the app by itself. */
export const onBackButton = (back: () => void): void => {
  if (inApp) void App.addListener("backButton", back)
}
