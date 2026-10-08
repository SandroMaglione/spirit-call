# The Spirit Call

The game's gacha: how new characters and aspects come, what a call costs
and brings, its guarantees, and how it is shown. It follows
[vision.md](vision.md) ("The gacha"): every call is worth having, nothing
owned comes twice, duplicates never add power, and skill stays enough.
The numbers are in `src/content/calls.ts` (live-tunable); the rules in
`src/account/calls.ts`.

## Where things come from

- **The new account** owns the Swordsman.
- **Quests** give the Gunner (the end of chapter one, The Brute) and the
  Tidecaller (the end of chapter two, High Tide), and the aspects that go
  with the first three characters: Duelist, Marksman, Riptide.
- **The Spirit Call** gives every other character and aspect. It opens
  once chapter one is cleared, when the second character arrives and the
  account holds crystals to spend.

`validateContent` checks every character comes from one place only (the
new account, a quest, or a banner); an aspect no quest gives is the Call's.

## Banners

- A **banner** is a pool of characters with a theme (Storm & Stone: the
  Stormcaller and the Stonekeeper). One runs at a time, for
  `rotation.days`, and the banners take turns, round and round: a banner
  is limited in time, but always comes back, so nothing is missable.
- The player **focuses** one character of the banner not owned yet. A
  character a call brings is always the focus: there is no coin flip to
  lose. With nobody left on a banner, it cannot be called (crystals are
  never spent for nothing).
- Adding a banner is adding an entry to `banners`; the order of entries is
  the order they run. Characters on a banner come from no quest.

## A call

One call costs `price` (200 crystals). It brings one of three things:

| Light | Result | Odds |
| --- | --- | --- |
| Gold | **The focused character** | 3%; from the 20th call since the last character, 10% more each call; certain at the 30th |
| Purple | **An aspect not owned yet** (one no quest gives) | 12% of the calls that bring no character; certain by the 10th call since the last aspect or character |
| White | **A supply**: gold, and some of the focused character's element's material | the rest |

- **The first character** the Call brings comes within 10 calls (instead of
  30): the beginner's guarantee, so the first visit pays off.
- **Nothing owned comes twice**: the character odds hold while the banner
  has someone left, the aspect odds while an aspect is left. Duplicates (and
  what they could turn into: looks) are for later.
- **The guarantees count every call**, across banners: switching banner or
  focus never loses progress. The screen shows how many calls at most
  until a character, and until an aspect.
- **The draws are saved**: each account draws from its own seed, saved with
  it, so a result is fixed when it is made (reloading never draws again).
- The last 60 calls are kept as the **history**.

## Pace

About one new character from calls every two chapters (an open number,
measured by `pnpm calls`: it plays the quest line at a fixed number of runs
per quest and calls with everything earned, many times over, and reports
when characters come). Crystals come from milestones only (see vision.md,
"Progression"); the price is the knob, then what quests and chests pay.
At 200 crystals a call, with 3 runs a quest and a week of hardcore a
chapter, the first character comes in chapter two, and about one every
two chapters after it (0.5 a chapter; the unlucky tenth one fewer by
chapter three).

## On screen

- **The Call screen** (Home, "Spirit Call"): the banner's name, theme, and
  when it ends; its characters, one focused (tap another to focus her); the
  focused character's model and what she does (her element and class, her
  special and ultimate), with **Try** (the Training Ground with her, before
  calling); the calls held, the guarantees, Call ×1 and Call ×10. Tabs:
  the banner, the details (every rate, what is left to get), the history.
- **The seal**: a call shows a stone seal at once, while the server works
  out what it brought. Hold it (or swipe up, or skip) and it cracks, the
  light coming through it white; until the answer is in, it holds nearly
  broken, straining. Once broken (and at least a moment and a half after
  it showed), the light rises to tell the best result, honestly: it stays
  white, or turns purple, then gold (the room dims, a pulse, a sting), and
  a gold light turns her element's colour as it bursts. A call the server
  could not make crumbles back to stone, and no crystals are spent. It
  bursts, and each result shows in turn, the best last: a character
  arrives as her model, with what she does, **Try** and **Party**; an
  aspect as its card; a supply as its amounts. A ten-call ends on all of
  them in a row. Skip goes to the next character or aspect (each is new,
  so it is shown), then to the row.
- Sounds and a short vibration (where the phone allows it) mark the crack,
  the light rising (purple, gold), the burst (or the crumble), and a
  character.

## Open

- Duplicates and what they turn into (looks), once there is something to
  turn them into.
- More banners as characters come; the rotation's length.
- The pace, once played: the price, and what quests and chests pay.
