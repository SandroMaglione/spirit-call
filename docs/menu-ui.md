# Menu UI

The preparation layer follows [vision.md](vision.md). Phone landscape is the
target for every screen, including menus, pause, and results. Existing spirits
and portraits carry the character identity; this adds no illustrations or
collection mechanics.

## Review and direction

The old menus spread navigation across screens, enlarged text with the viewport,
and mixed inspecting a choice with committing it. The first redesign kept too
much of an app shell: permanent navigation, enclosed panels, account information,
and feedback messages competing with a small character preview.

The reference is the spatial organization of Genshin Impact's mobile
[character screen](https://interfaceingame.com/screenshots/genshin-impact-mobile-attributes/):
a large animated character, controls at the edges, transparent information,
and secondary menus summoned on demand. The game's own spirits remain the art.
Preparation still needs clear enemy, reward, and unlock information, but
descriptions appear only when requested.

## Implemented

- Full-screen lobby with a large idle spirit, drag rotation, touch rings,
  drifting motes, and luminous backgrounds keyed to the character's element.
  Profile opens a compact menu drawer. Floating icons open Characters, Party,
  and Challenges; the selected challenge and Start sit at the lower right.
- Character inspection keeps the model central. Portraits and icon tabs select
  characters, attributes, weapons, and abilities. Stats, passives, and skill
  descriptions open on tap. Upgrades show their cost and commit explicitly.
  Locked previews link to actual shipped unlock quests.
- Party members stand openly on the stage. Tapping a slot summons a translucent
  portrait gallery with staggered entrances and light selection markers.
  Details and removal are separate icon actions. Confirm saves changes;
  starting also saves them. Matchups open only when requested.
- Challenge categories and selections sit beside a compact briefing. Enemy
  portraits open details; reward icons and character previews show what is
  earned. Start stays outside the scrolling briefing. Inspecting a locked
  choice does not prevent the lobby from starting the saved playable choice.
- Results show reward symbols, account progress, and unlocked items over the
  arena. A newly earned character takes the large stage, turns into the light,
  and receives a brief ring reveal. Tapping skips the reveal. Unlocks open the
  character's abilities or matching weapon screen. Run details contain the
  discovery breakdown and partial-reward rule. No extra rewards are invented.
- Pause opens a small drawer over the visible arena. Resume stays visible;
  Restart and Leave require a separate confirmation. Sound controls open on
  request. Escape cancels a confirmation before resuming.
- Controls have fixed SVG boxes, centered icon-label groups, touch targets of
  at least 44 CSS pixels, press feedback, and synthesized menu sounds. Portrait
  galleries, weapon choices, party members, and rewards avoid enclosing cards.
  Reduced motion suppresses UI effects and the model reveal. The phone rotate
  guard applies to menus as well as combat; there is no separate portrait UI.
- Successful saves give a brief glow and sound without a toast. Failures open
  an explicit dialog. Account writes are serialized and become visible only
  after durable storage succeeds; duplicate upgrade taps are guarded. Each
  result is recorded once, with stale callbacks ignored.
- Dialogs own focus and Escape. Native Enter/Space and volume sliders work in
  menus. Held combat input is released on menu or pause entry, and paused
  simulation timers freeze. Menu routing and team drafts survive arena visits;
  saved selections survive reloads.

## Validation

- `pnpm check`: typecheck, lint, and all 422 tests pass. Tests include account
  save failures and serialization, paused timers, menu input, and routing.
- Production build passes.
- Browser checks use the network address in phone landscape at 667 × 375 and
  844 × 390. Exercised lobby, portrait selection, party saving, challenge
  categories, locked previews, skill details, practice, sound, pause,
  confirmations, dialog focus, and results.
- Synthetic touch pointers rotate the spirit and trigger its ring. Button
  measurements confirm centered action labels and 44-pixel targets. This is
  browser touch-event coverage, not a physical-phone playtest.
- A completed-wave fixture follows the normal result/save path: one clear,
  105 XP, 190 crystals, 625 gold, one discovery, and Gunner unlocked. The totals
  include discovery rewards once and persist on reload. This verifies the
  reward flow; it is not a manually played victory. The preview account is
  backed up and restored after first-unlock checks.

## Follow-up

Playtest the landscape build on iOS and Android. Check notch spacing, real
thumb reach, sound, frame cost, and whether a new player can start, change the
leader, inspect a lock, and retry without explanation. Browser presets change
CSS dimensions and do not prove real-device behavior.

Illustrations can come later. Pull pricing, guarantees, duplicates, multiple
saved teams, and revive rules remain the vision's open decisions.
