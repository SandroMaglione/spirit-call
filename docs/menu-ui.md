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
  Profile opens a compact menu drawer. A vertical text menu on the left opens
  Characters, Party, and Challenges. The spirit occupies the center; its name
  and level sit at the right, above the quest-name play button. Party portraits
  run across the top center in their saved order. Selecting a spirit keeps
  those circles in place, while that spirit leads the next run.
- Character inspection follows the reference's proportions: a horizontal scrolling
  portrait row in the header, left-edge Attributes/Aspects/Skills menu, central animated spirit, and
  open details at the right. Level and equipped stats are visible together in
  compact rows, with next-level gains before right-aligned totals and a Level up action at the bottom.
  Characters display no XP. Passives and skill descriptions open on tap.
  Locked characters keep their spirit and name, with a glowing lock seal in
  place of all tabs, stats, level, and unlock instructions. Aspect unlock
  details remain available for owned characters.
- Party members stand openly on the stage. Tapping a slot summons a translucent
  portrait gallery with staggered entrances and light selection markers.
  Spaced slot markers sit above the models. Character names open details;
  removal lives in the picker, which keeps at least one member. Confirm saves changes;
  starting also saves them. There is no party matchup dialog.
- Challenges use a full-screen horizontal carousel, with drag feedback,
  directional transitions, arrow controls, and category tabs. Each quest
  shows its name, objective, enemy level, and rewards without enemy models
  or a sidebar. Enemy names and elemental traits are available in Details.
  The enter action stays fixed at the lower right. Inspecting a locked
  choice does not prevent the lobby from starting the saved playable choice.
- Results show reward symbols, account progress, and unlocked items over the
  arena. A newly earned character takes the large stage, turns into the light,
  and receives a brief ring reveal. Tapping skips the reveal. Unlocks open the
  character's abilities or matching aspect screen. Run details contain the
  discovery breakdown and partial-reward rule. No extra rewards are invented.
- Pause opens a small drawer over the visible arena. Resume stays visible;
  Restart and Leave require a separate confirmation. Sound controls open on
  request. Escape cancels a confirmation before resuming.
- Controls have fixed SVG boxes, centered icon-label groups, touch targets of
  at least 44 CSS pixels, press feedback, and synthesized menu sounds. Portrait
  galleries, aspect choices, party members, and rewards avoid enclosing cards.
  Reduced motion suppresses UI effects and the model reveal. The phone rotate
  guard applies to menus as well as combat; there is no separate portrait UI.
- Screens use the same edge spacing, with symmetric safe-area allowances.
  The header uses small borderless back arrows and titles while retaining
  44-pixel touch targets. Gold appears at the upper right only for leveling
  an owned character; the account drawer holds both balances. Symbols are
  20 pixels, with 3-pixel icon-number gaps and 12-pixel gaps between currencies.
  Currency artwork is shared by wallet balances, upgrade costs, and rewards.
  XP and the four elements use filled, faceted emblems. Currencies and emblems
  catch a brief shimmer and glint every six seconds, with staggered timing.
  Reduced motion disables these effects. XP artwork is shared by quest rewards,
  results, and the account drawer; element artwork is shared by headers,
  abilities, and enemy details.
  Quest categories and practice modes sit in the header. XP rewards show their
  emblem and amount, with the name available to accessibility. Back handles return navigation; screens have no duplicate close action.
- Successful saves give a brief glow and sound without a toast. Failures open
  an explicit dialog. Account writes are serialized and become visible only
  after durable storage succeeds; duplicate upgrade taps are guarded. Each
  result is recorded once, with stale callbacks ignored.
- Dialogs own focus and Escape. Native Enter/Space and volume sliders work in
  menus. Held combat input is released on menu or pause entry, and paused
  simulation timers freeze. Menu routing and team drafts survive arena visits;
  saved selections survive reloads.

## Validation

- Rebased onto the aspects rework on main. Character stats depend on character
  level only; aspects have no levels and travel with the selected team.
- `pnpm check`: typecheck, lint, 57 test files and 467 tests pass, with one
  existing skip. Production build passes with the existing large-chunk warning.
- Network-browser checks at 667 × 375 and 844 × 390 cover header navigation,
  contextual currencies, locked characters, and touch quest swipes. Attributes
  and Level up fit without scrolling; totals share the same right edge.
- A separate localhost account verifies selecting and saving plain and owned
  aspects, locked choices, and entering with the saved aspect. The compact
  picker fits at 667 × 375 with 44-pixel targets. Temporary account changes
  are restored afterward.
- XP rewards show only the shared emblem and amount. Currency artwork remains
  shared by balances, costs, and rewards. Browser touch events cover gesture
  behavior; these checks are not a physical-phone playtest.

## Follow-up

Playtest the landscape build on iOS and Android. Check notch spacing, real
thumb reach, sound, frame cost, and whether a new player can start, change the
leader, inspect a lock, and retry without explanation. Browser presets change
CSS dimensions and do not prove real-device behavior.

Illustrations can come later. Pull pricing, guarantees, duplicates, multiple
saved teams, and revive rules remain the vision's open decisions.
