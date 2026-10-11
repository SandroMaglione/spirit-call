# Menu UI

The screens around the arena: the menu, the pause menu, and the results.
They follow [vision.md](vision.md): the game is for the phone, in landscape
only, and preparing for a fight should be quick and clear. The reference for
how they look, feel, and are laid out is Genshin Impact's menus (the
character screen, the inventory, the talents).

This is the guide to read before adding or changing a screen. The combat HUD
is separate (`src/presentation/hud.ts`, styled in `index.html`).

## The rules

1. **One shell.** Every screen has the same corners: where you are at the
   top left, a switcher in the top middle, close at the top right, a list of
   sections down the left, and one main action at the bottom right. A new
   screen fills in the shell; it does not invent a layout.
2. **A dark backdrop in one element's colour.** White text always reads, and
   the spirits glow. The colour is the inspected character's, or the party
   leader's.
3. **Cream is for what you press or picked.** Main buttons, the selected row
   or tab, a card's foot. Everything else is light text on the dark
   backdrop, with gold for small labels.
4. **Things that come in a set are cards.** Characters, enemies, aspects,
   discoveries, rewards.
5. **Explanations stay open in a panel** beside what they explain. Nothing
   opens a dialog to be read. The only dialog (`Confirm`) asks before
   something that cannot be undone, or tells of a failure.
6. **Nothing is hidden.** Every place is one tap from the home; enemies and
   what they are weak to show before a fight without asking.
7. **Icons over words** on buttons where the meaning is clear, and few
   words elsewhere.
8. **A red badge** marks a place with something to do (today: a level-up
   the account can afford). Keep them rare.

## One layout, scaled

The UI is laid out in **units**: 390 units high, a phone in landscape, and
scaled as one piece to fill the screen (`src/ui/kit/scale.ts`). A tablet or
a desktop shows the same proportions, only larger. Write sizes in `px` in
the stylesheets: a `px` there is a unit.

The width follows the screen's shape, from 680 units (a 16:9 phone) up.
Screens anchor their parts to the edges (`--left`, `--right`, `--top`,
`--bottom`, which also keep clear of notches), so a wider screen gives the
middle more room. **Check every screen at 667 × 375 and 844 × 390.** Where
680 units is too tight, a container query on the UI's width drops what is
least needed (the character's Skills tab hides the moves' names there).

Everything pressable is at least 44 units to touch, whatever it shows (small
buttons extend their touch area with `::after`).

## Where things are

- `src/ui/kit/`: **the kit**, pieces that know nothing of the game. Its
  look is `kit.css` (the colours, the backdrop, every piece).
- `src/ui/menu/parts.tsx`: **the game's pieces**, built from the kit: a
  character or an enemy as a card, an enemy's weaknesses, amounts of
  rewards, the wallet, the party strip.
- `src/ui/menu/*.tsx`: **the screens**, one file each; `screens.ts` lists
  them and how to move between them. `src/ui/Menu.tsx` shows the current
  one. `src/ui/Pause.tsx` and `src/ui/Results.tsx` are the two over a run.
- `src/ui/screens.css`: each screen's own layout (where its parts sit).
- `src/ui/Backdrop.tsx`: the layer behind the UI.
- `src/ui/describe.ts`: content described in plain words, generated from
  its data. New content describes itself; the UI holds no content text.

A new look belongs in the kit; a new use of the game's data in
`menu/parts.tsx`; a screen only arranges them. If a screen needs its own
colour, border, or font size, the kit is probably missing a piece: add it
there, with a comment saying when to use it.

## The kit

| Piece | File | Use it for |
| --- | --- | --- |
| `Screen` | `kit/shell.tsx` | A screen's root. |
| `TopBar` | `kit/shell.tsx` | Where you are, and close. Its children sit in the middle (`TopTabs`, a roster); `end` holds the currencies the screen spends. |
| `TopTabs` | `kit/shell.tsx` | A few views of the same screen (Main, Side, Hardcore). |
| `SideTabs` | `kit/shell.tsx` | A screen's sections down the left; with no `current`, a list of places to go (the home, the pause menu). |
| `Actions` | `kit/shell.tsx` | The bottom right corner: the main action last. |
| `Coin` | `kit/shell.tsx` | An amount the account holds. |
| `Pill` | `kit/controls.tsx` | An action with a name. Cream: the main one. Dark: the others. One cream pill per screen. |
| `RoundButton` | `kit/controls.tsx` | An action an icon says alone (close, home, retry). |
| `Toggle`, `Slider` | `kit/controls.tsx` | On or off; an amount. |
| `Badge` | `kit/controls.tsx` | Something to do there. |
| `Card`, `Cards` | `kit/Card.tsx` | One of a set: art over a cream foot. `mark` for picked or a place in the party, `selected` for the one looked at, `locked`, `fresh` for just earned. |
| `CardRow` | `kit/Card.tsx` | Cards on one line that can outgrow it (the results' rewards): centered while they fit, else scrolling sideways, snapping to a card, faded at an edge with more beyond. |
| `Panel` | `kit/panel.tsx` | What is selected, explained: a coloured head (a `subtitle` for the one line that sets it apart), a body that scrolls, a cream `note` for the one thing not to miss (why it is locked). |
| `Row` | `kit/panel.tsx` | One of a list to pick from; the selected one turns cream. |
| `Fact` | `kit/panel.tsx` | A name and its value on a banded line: a stat, a cooldown, a setting (`tall`). |
| `Label`, `Bar`, `Chips` | `kit/panel.tsx` | A gold heading over a group; progress; a short sequence. |
| `Confirm` | `kit/Confirm.tsx` | The one dialog. |
| `Model`, `ModelStage`, `Portrait`, `Face` | `kit/art.tsx` | The game's art: a live model, one the player can turn, a picture, a round picture. |

The game's pieces (`menu/parts.tsx`): `Wallet`, `CharacterCard`,
`EnemyCard`, `Affinities`, `Enemies` (a fight's enemies over their
weaknesses, tap to inspect), `EnemyFacts`, `Amounts` (rewards, materials
included), `MaterialIcon` (an element's emblem, open like a currency), `Stars` (a quest's three, lit when earned, popping in when
earned just now), `UnlockBadge` (a character or an aspect a reward makes
yours: her face, or the aspect's class on a dark disc, in a turning gold ring
that pulses; rewards show unlocks on a line of their own, named), and
`PartyStrip`, `KitLines` (a character's special and ultimate, a line each:
the collection's character shelf), and `describeSource` (where something
comes from, in a few words, from `content/collection.ts`).

Icons are `src/ui/Icon.tsx` (line icons, currencies, elements, XP) and
`src/ui/AbilityIcon.tsx` (a class or a skill). They size with the text:
set `font-size`.

## Text and colour

One family (Alegreya Sans), in these sizes, in units:

| Size | For |
| --- | --- |
| 46 | The results banner. |
| 26 | A name: the character, a screen's big title. |
| 23 / 19 | Side tabs: the current one, the others. |
| 17–18 | Buttons, panel heads, the top bar. |
| 14–15 | Rows, facts. |
| 13 | Reading text. |
| 11–12 | Labels (gold, capitals), a card's foot. |

Colours are variables in `kit.css`: `--cream` and `--ink` (what you press),
`--gold` and `--gold-hi` (labels, accents), `--text` and `--dim`, `--red`
(badges), `--up` (a gain, done). An element sets `--deep`, `--mid`, and
`--glow` on anything with `data-element`; a card's art takes `data-tint`.

## Layers and models

From the back: the arena, the backdrop (`.ui-backdrop`), the menu's models
(the showcase canvas, `src/presentation/showcase.ts`), then the UI (`.ui`).
The UI only marks where a model or a portrait goes (`data-model`,
`data-portrait`); the presentation draws it. Enemy portraits use close-ups of
the supplied roster illustration, framed by `enemyPortraits` in `looks.ts`;
targets missing from that illustration keep their model portraits. Character
portraits are rendered from their models. Because models draw under the
UI, a panel covers a model behind it: give a model's place the room that
is left, and keep text off it.

## Motion

- Entering a screen: the left side comes from the left, the right from the
  right, the action from below, about 0.28 s (`in-left`, `in-right`,
  `in-below`; the shell's pieces do it themselves).
- A press scales the button down and brightens it; a tap makes the menu
  sound (wired once, in `main.ts`, for every button in the UI).
- A level-up pulses the screen. The results come in a piece at a time
  (about 2.3 s for a cleared quest, a tap shows it all): the title (a
  victory bright, a defeat falling), each star (a new one lands with a
  ping), the run, the cards one after another, the account's bar, then the
  buttons.
- Entering the arena, the screen is dark for a moment: what is played and
  the team's faces come in, and it fades onto the run (0.9 s; the run
  starts underneath, nothing waits).
- `prefers-reduced-motion` turns all of it off.

## Behaviour worth knowing

- **Launch resumes the last account.** Loading stays visible while the
  account and models open. Settings' Switch account opens the create/select
  screen; first launch shows it too. A failed read changes nothing, and an
  account held by another tab stays in the picker with an explanation.
- **The tutorial** opens before the menu for an account that has not
  completed or skipped it. The Swordsman practices alone with a Sparring
  Dummy that never falls and deals no damage. Moving, dashing, attacking,
  the special, the ultimate, and a perfect dodge are asked in order, with
  instructions on the arena floor matching touch or keyboard controls.
  The final perfect dodge shows success on the floor through its slow
  motion and for another 0.8 seconds, then opens a win screen that waits
  for a choice: start chapter
  one's first quest directly, with the saved party, or go to Home. Skip
  leaves for the menu; Settings' Controls tab can replay it. It pays
  and records nothing. Switching and elemental bursts are left for later.
- **The party is kept as it is set up.** There is no confirm: the menu
  saves it immediately when a character is changed, swapped, added, or
  removed, and when an aspect or relic is equipped. The current party and
  its active saved slot are kept together in one account change, if they
  follow the rules. Only a failure is shown.
- **Her gear has a screen of its own** (`menu/Gear.tsx`), since there
  will be many aspects, relics, and looks, each with its own explanation:
  tabs Aspect, Relics, Looks; the cards on the left (relics under her four
  slot buttons on one row, looks under Tint and Trail; no model, so the
  cards have the room), the one picked explained on the right with what
  can be done (Equip, Take off, buy a relic's next tier or a look, Wear).
  It is hers alone: no roster in its top bar (her page steps between
  characters). Aspects and relics
  are equipped for a member of the party, each on one member at most
  (equipping moves it; see `aspects.md`, `relics.md`); looks are hers in
  every party, and a look's card shows it. Her page's Gear tab sums it up
  as cards with no labels: her aspect and her two looks on a row, her four
  relic slots under a divider, in her element's colors (softer where
  nothing is chosen yet, `Card`'s `faded`; a plus in the corner there, a
  swap where something is), each opening the gear screen on that very
  slot; each party place's aspect button, with her relics' charms, opens
  it too.
- **A relic's tier** shows as three tall diamonds stacked left to right
  (the three fill a square; fills are opaque, so none shows through
  another), the first ones lit (`TierMarks`): under the charm on its card,
  and leading each tier's line in its panel.
- **A look shows as itself**: a tint's card is her portrait wearing it, a
  trail's a picture of what it sheds (drawn once by the showcase); the
  collection's looks shelf shows the one picked large between the cards and
  the brief (a tint on her model, a trail's picture).
- **The collection** (`menu/Collection.tsx`, from the home) shows
  everything to own, shelf by shelf (characters, aspects, relics, looks),
  owned or locked, each saying where it comes from (and a relic each of its
  tiers), with Go there to open that card in the challenges. The home's top
  shows how much of the collection is owned.
- **Inventory** (`menu/Inventory.tsx`) is the last destination in Home's
  list: what the wallet holds, where each comes from, and what it is for
  at the panel's foot.
- **Auditions** are a tab of the challenges: each lends its character, so
  the party strip gives way to her face, and the brief says she is played
  alone at the tier's level. Try is always available, even before inviting
  her: the Training Ground lends her alone with her plain kit at the
  party's level, records nothing, and leaves the saved party alone.
- **Saved parties**: the party screen's top bar holds three slots (tap an
  empty one to save the party there, a saved one to load it). The selected
  slot is highlighted and named beside Party, or "No slot" when none is
  selected. Edits save to the active slot immediately, with no Save button.
  The slot survives leaving the screen, a run, and restarting the game.
  The starter party occupies Slot 1. Home's portraits have no slot caption.
  The party screen has no Play button; its three places use the full height
  below the top bar. Playing starts from Home or a challenge.
  In a dev build, `?partyTest&touch` opens Party with a separate test account:
  every character owned, the Swordsman alone in Slot 1, and edits kept on
  later visits. It uses the normal loading screen and leaves other accounts
  alone.
- **The top bar's tabs never move**: the bar is three columns with equal
  sides, so its middle stays centered whatever stands at its ends (a
  wallet shown on one tab and not another), and a tab is as wide as its
  label in bold.
- **The party's roster opens beside a place** when it is tapped (a panel of
  cards that scrolls, since the roster will grow), over the left of the
  screen; a tap on a card puts her there and closes it.
- **Leading**: a tap on a party face on the home leads the next run with
  her, without changing the party's order.
- **Locked things stay visible** and say where they come from, from the
  collection's sources only (`content/collection.ts`), never an invented
  rule.
- **Escape** closes the dialog, else goes back one screen; in the pause
  menu it resumes.
- Menu routing and the party being set up survive a visit to the arena.

## Checking a change

`pnpm check`, then a real browser on the network address (see `AGENTS.md`)
at 667 × 375 and 844 × 390 with touch: every screen, a locked character, a
party of one and of three, a run to its results, and the pause menu.

## Still open

- A real-phone pass: notch spacing, thumb reach, frame cost.
- Badges for a new character or aspect not looked at yet (needs a "seen"
  record on the device).
- One-line character blurbs and move tips, if wanted: content, not UI.
- Duplicates and reviving are settled as "never" (`vision.md`).
