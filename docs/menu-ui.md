# Menu UI

The menu follows the phone-first preparation layer in [vision.md](vision.md).
The existing animated spirits carry the character identity. There are no new
illustrations, story panels, currencies, or collection systems.

## Review and direction

The previous menu spread navigation across screens, scaled text and controls
with the viewport, and often mixed inspecting a choice with committing it.
Locked choices were hard to understand. Results did not clearly connect a run
to account progress. Arena keyboard handling also intercepted native menu keys.

The reference direction is a character-led game lobby, with the calm hierarchy,
ivory labels, gold actions, elemental accents, and rewarding transitions of an
anime action game. Preparation stays quick: choose a challenge, inspect its
enemies when needed, prepare the team, and start. Extra information appears on
request. A phone should never need a desktop dashboard to launch a run.

## Implemented

1. Shared navigation, wallet, back button, and settings. The phone dock has four
   main destinations and More for discoveries and practice. Desktop and wider
   landscape use a side rail. Menu selections and the draft team survive arena
   visits; the saved selection survives reloads.
2. Compact Home with the idle spirit, account progress, selected challenge,
   team shortcut, Start, and the next main quest. On a small phone it fits
   without scrolling. Inspecting a locked challenge does not strand Home.
3. Challenge selection and briefing are separate steps on a phone. Briefings
   show the objective, enemy level, enemy portraits, requirements, and rewards.
   Enemy details and challenge descriptions open only when requested. Category
   changes always select a challenge from that category.
4. Team editing separates slot selection, Details, Remove, and Add/replace.
   Changes have an explicit save action; starting also saves the team. Matchups
   describe elemental coverage without claiming a character is required.
5. Owned and locked characters remain inspectable. Overview, Weapon, and
   Abilities use the existing models. Stats and ability descriptions expand on
   tap. Quest links use actual content unlocks. Inspecting a weapon does not
   equip it; upgrades show their gold cost.
6. Results show total rewards, account XP and levels, discoveries, and clickable
   unlocks. Their animation is cosmetic and can be skipped. Retry, team changes,
   and the next quest lead directly to the relevant preparation step. Practice
   records no rewards. Defeat describes the existing partial-reward rule.
7. Pause keeps Resume visible while secondary content scrolls. Restart and
   Leave require a separate confirmation. Escape cancels that confirmation
   before resuming. Paused simulation time, hit-stop, and slow motion freeze.
8. Shared SVG symbols have fixed visual boxes. Action labels and arrows align
   as one centered group. Controls have at least 44 CSS-pixel touch targets,
   safe-area spacing, selected and disabled states, press feedback, and small
   synthesized menu sounds. Reduced-motion preferences suppress UI motion.
9. Dialogs own focus and Escape. Native Enter/Space and volume sliders work in
   menus; held combat input is released on pause or menu entry. Character
   previews retain idle animation across navigation and clip below the header.
10. Account mutations are serialized and committed in memory after durable
    storage succeeds. Duplicate upgrade taps are guarded. Success feedback and
    reward reveals occur after saving; failures are shown explicitly.

## Validation

- `pnpm check` passed: typecheck, lint, and all 422 tests. A full run with two
  workers also passed. Earlier parallel runs hit timeouts in two existing
  simulation tests under local load; the final default run passed both.
- Production build passed.
- Browser inspection used the network address, including 375 × 667 and
  390 × 844 portrait, and 844 × 390 landscape. The small Home has no page
  scroll or horizontal overflow. Landscape pause keeps Resume visible.
- Exercised category changes, locked previews and quest links, enemy details,
  practice entry, team saving, character leveling, weapon upgrades, settings,
  reload/readback, pause confirmations, Escape, and dialog focus wrapping.
- A completed-wave fixture exercised the normal result and account-save path.
  It recorded one clear, included discovery rewards once, unlocked Gunner,
  and retained that progress after reload. This is a result-flow test, not a
  manually played victory.
- Synthetic touch pointer activation opened More; keyboard Enter toggled sound
  without starting combat. Real-device touch, notch behavior, haptics, and audio
  feel still need a physical-phone playtest.

## Follow-up

Playtest on a phone before adding more menu information. Measure whether a new
player can start, change the starting character, understand a lock, and retry
without explanation. Check the exact safe area and landscape keyboard-free
layout on iOS and Android. Browser presets only change CSS size.

Optional illustrations and richer character art can come later. Pull pricing,
guarantees, duplicates, multiple saved teams, and revive rules remain the
vision's open decisions. This redesign does not settle them.
