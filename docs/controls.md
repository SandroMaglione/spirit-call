# Controls

How the player's input reaches a fight, on every device, and how players
move their keys and buttons.

## Devices into commands

Each device is a service in `src/schema.ts` (`KeyboardInput`,
`PointerInput`, `TouchInput`, `GamepadInput`, `PartyInput`), captured once
per fixed step into a resource (`Keys`, `PointerState`, `TouchState`,
`PadState`, `PartyState`; see `src/features/input.ts`). `main.ts` gives the
browser's devices; tests, bots, and the perf scenes give scripted ones
(`Keyboard.scripted`, `Gamepad.scripted`, ...), so nothing else changes
between a real game and a headless one.

`ResolveControls` turns the device used last into one value, `Controls`,
which is all gameplay reads: move, aim point, attack, dash, each skill
slot, and a team switch. There are two ways to play:

- **Keyboard and mouse** aim at the cursor (`resolveDesktop`).
  Double-tapping a direction dashes.
- **Touch and a gamepad** aim with a stick and the aim assist. Both are read
  as `StickControls` (`touchSticks`, `padSticks`) and share one resolver,
  `resolveSticks`: a stick moves, attacks turn toward the assist's pick, and
  an aimed skill goes on release, along its drag (touch) or the right stick
  (a gamepad). A gamepad keeps a skill's last aim when the stick is let go
  a moment before the button.

`Controls.device` (`"desktop" | "touch" | "gamepad"`) tells the HUD, the
aim ring, the camera, the tutorial, and the settings which way is in use.

A new device is one more service and capture system, and either a reader
into `StickControls` (if it aims with a stick) or a resolver of its own.

## The gamepad

Read with `Gamepad` from `@typeonce/ritmo-browser`, by the standard
mapping's button names (`south` is A on Xbox, Cross on PlayStation). The
defaults (`padBindings` in `src/config/input.ts`): left stick moves, west
attacks (held, it charges), south dashes, the right bumper is the special,
the right trigger the ultimate, the right stick aims a held skill, the
d-pad's left, up, and right switch to the team's first, second, and third,
and Start pauses.

Browsers expose a gamepad only in a secure context: HTTPS, localhost, or
the apps. The phone-over-network dev server (`pnpm dev --host`) is plain
HTTP, so try a gamepad on localhost, a deployed stage, or an app build.

In the menus (and paused, and on the results), `src/presentation/menu-pad.ts`
reads its own `Gamepad.actions`: the d-pad or left stick moves the focus to
the nearest button that way, south presses it, east goes back (as Esc
does), and left and right change a focused slider. It has the gamepad
whenever a fight does not.

## Remapping

`src/config/controls.ts` holds the player's changes over the defaults
(`ControlBindings`): one physical key (`KeyboardEvent.code`) or one button
per remapped command. They are saved with the device's settings (version
4, `src/account/stored.ts`), and applied with `rebind` on the live
keyboard and gamepad (and to the HUD's and the tutorial's hints).

- Movement, the special, the ultimate, and the team switches move on a
  keyboard; the attack, dash, skills, and switches on a gamepad. The mouse
  and the double tap stay as they are.
- Esc, Enter, R, M, and Tab, and Start, Select, and Home, keep their meaning
  everywhere and cannot be picked, so nobody loses the way out.
- Picking a key or button another command uses swaps the two: no key does
  two things, and no command is left without one.
- Settings, Controls lists each command; picking one waits for the key or
  button (Esc or Start, or six seconds, gives up). Each list resets to the
  defaults.
