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
the Spirit Call), and `describeResult` (what a call brought, in a few words).
The Spirit Call's seal (`menu/CallReveal.tsx`) shows over its screen, and
sets the sky (`store.sky`) while it does: plain stone, then the arriving
character's element.

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
- A level-up pulses the screen; the results' cards arrive one after another.
- `prefers-reduced-motion` turns all of it off.

## Behaviour worth knowing

- **The party is kept as it is set up.** There is no confirm: the menu
  saves it when a screen is left (and when an aspect is equipped), if it
  follows the rules; entering a run saves it too. Only a failure is shown.
- **Aspects are equipped on the character's Aspect tab**, for a member of
  the party (an aspect is on one member of a party; see `aspects.md`). The
  party screen links to it.
- **The party's roster opens beside a place** when it is tapped (a panel of
  cards that scrolls, since the roster will grow), over the left of the
  screen; a tap on a card puts her there and closes it.
- **Leading**: a tap on a party face on the home leads the next run with
  her, without changing the party's order.
- **Locked things stay visible** and say where they come from, from shipped
  rewards only (`sourceOf`), never an invented rule.
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
- Duplicates, several saved parties, and revive rules remain the vision's
  open decisions.
