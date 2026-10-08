# The Spirit Call

The game's gacha: how new characters, aspects, looks, and relics come,
what a call costs and brings, its guarantees, and how it is shown. It
follows [vision.md](vision.md) ("The gacha"): every call is worth having,
no character, aspect, or look owned comes twice, a relic coming again is
progress (its next tier, then dust), and skill stays enough.
The numbers are in `src/content/calls.ts` (live-tunable); the rules in
`src/account/calls.ts`.

## Where things come from

- **The new account** owns the Swordsman.
- **Quests** give the Gunner (the end of chapter one, Pack Leader) and the
  Tidecaller (the end of chapter three, Brute King), and the aspects that go
  with the first three characters: Duelist, Marksman, Riptide. Two relics
  come from quests too (Echo from The Swarm, Momentum from Hold the Line).
- **The Spirit Call** gives every other character and aspect, the looks
  that are its own, and relics. It opens once chapter one is cleared, when
  the second character arrives and the account holds crystals to spend;
  relics open with it.
- **The shop** (for dust) sells a relic owned one tier up, and its own
  looks; **hardcore tiers** give a few looks, once (see `relics.md`).

`validateContent` checks every character comes from one place only (the
new account, a quest, or a banner); an aspect no quest gives is the Call's;
a look comes from the shop, the Call, or a hardcore tier.

## Banners

- A **banner** is a pool of characters with a theme (Storm & Stone: the
  Stormcaller and the Stonekeeper). One runs at a time, for
  `rotation.days`, and the banners take turns, round and round: a banner
  is limited in time, but always comes back, so nothing is missable.
- The player **focuses** one character of the banner not owned yet. A
  character a call brings is always the focus: there is no coin flip to
  lose. With nobody left on a banner, a call there brings everything else
  (relics are always worth something: a tier, or dust); before relics open
  it cannot be called (crystals are never spent for nothing).
- Adding a banner is adding an entry to `banners`; the order of entries is
  the order they run. Characters on a banner come from no quest.

## A call

One call costs `price` (200 crystals). It brings one of five things,
rarest first (one roll after the character's, in that order):

| Light | Result | Odds |
| --- | --- | --- |
| Gold | **The focused character** | 1%; from the 32nd call since the last character, 8% more each call; certain at the 45th |
| Purple | **An aspect not owned yet** (one no quest gives) | 6% of the calls that bring no character; certain by the 15th call since the last aspect or character |
| Rose | **A look not owned yet**, of those only the Call gives | 10% |
| Blue | **A relic** (any one): new at tier I, owned one tier up, at tier III turned into 50 dust | 40%; certain by the 4th call since the last relic or anything rarer |
| White | **A supply**: 400 gold, and 6 of the focused character's element's material | the rest |

The shares are of a call that brings no character. An aspect's or a
look's share with none of them left to get goes to relics (the Details tab
shows the shares as they stand).

- **The first character** the Call brings comes within 25 calls (instead of
  45): the beginner's guarantee, landing in chapter 5.
- **No character, aspect, or look comes twice**: the character odds hold
  while the banner has someone left, the aspect and look odds while one is
  left. A relic comes again on purpose: its next tier, then dust (see
  `relics.md`).
- **The guarantees count every call**, across banners: switching banner or
  focus never loses progress. The screen shows how many calls at most
  until a character, until an aspect, and until a relic.
- **The draws are saved**: each account draws from its own seed, saved with
  it, so a result is fixed when it is made (reloading never draws again).
- The last 60 calls are kept as the **history**.

## Pace

Characters are the Call's rare prize, as in Genshin: **the first in
chapter 5**, and each one after more slowly, in the ranks' replays (an open
number, measured by `pnpm calls`: it plays the quest line at a fixed number
of runs per quest, then the rank II and III replays, and calls with
everything earned, many times over, and reports when characters come).
Crystals come from milestones only (see vision.md, "Progression"): first
clears, chests, account levels, discoveries, and hardcore tiers. The price
stays 200; the knobs are what those pay and the guarantees.

After the playtest of 2026-10-07 (a first character on the 10th call, in
chapter 3; 3,000 crystals in 14 runs), every crystal source was cut by a
quarter and the guarantees lengthened. With 3 runs a quest and a week of
hardcore a chapter, an account holds about 27 calls by the end of chapter
5, so the beginner's guarantee (25) brings everyone's first character
there (a lucky tenth in chapters 3–4). The second comes by the end of the
rank III replay (a lucky tenth in chapter 6). `pnpm calls` also reports
what else calls bring by then: aspects, looks, relic copies and the tiers
owned, and dust. By chapter six, about 14 relic copies (of 33 tiers) and 3
of the 7 looks.

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
  white, or turns blue (a relic), rose (a look), or purple (an aspect), or
  goes through purple to gold (the room dims, a pulse, a sting), and a gold
  light turns her element's colour as it bursts. A call the server
  could not make crumbles back to stone, and no crystals are spent. It
  bursts, and each result shows in turn, the best last: a character
  arrives as her model, with what she does, **Try** and **Party**; an
  aspect, a look, or a relic as its card (a relic with the tier it reached
  and what that tier adds, or the dust it turned into); a supply as its
  amounts. A ten-call ends on all of them in a row. Skip goes to the next
  result that is not a supply, then to the row.
- Sounds and a short vibration (where the phone allows it) mark the crack,
  the light rising (purple, gold), the burst (or the crumble), and a
  character.

## Open

- Character and aspect duplicates and what they turn into (skins, look
  variants), once there is something to turn them into.
- More banners as characters come; the rotation's length.
- The pace, once played: the price, and what quests and chests pay.
