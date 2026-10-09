# The Spirit Call

The game's gacha: how new characters, aspects, and looks come, what a call
costs and brings, its guarantees, its exchange, and how it is shown. It
follows [vision.md](vision.md) ("The gacha"): a character is the prize and
feels like one, a rare thing is a gift, every call leaves something
behind, no character, aspect, or look owned comes twice, and skill stays
enough. The numbers are in `src/content/calls.ts` (live-tunable); the
rules in `src/account/calls.ts`.

The model is Genshin's, cut to this game's size: three tiers, the top one
rare and guaranteed, the middle one a few per banner, the bottom one a
token for an exchange (Genshin's starglitter). What Genshin farms rather
than pulls (its artifacts) stays out of the Call here too: relics come
from play (see `relics.md`), never from a call.

## Where things come from

- **The new account** owns the Swordsman.
- **Quests** give the Gunner (the end of chapter one, Pack Leader) and the
  Tidecaller (the end of chapter three, Brute King), and the aspects that go
  with the first three characters: Duelist, Marksman, Riptide. Relics come
  from quests too (see `relics.md`).
- **The Spirit Call** gives every other character, every other aspect, and
  the looks that are its own. It opens once chapter one is cleared, when
  the second character arrives and the account holds crystals to spend.
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
  lose. With nobody left on a banner, a call there brings the rest (rare
  things and sigils); with the rare pool empty too, it cannot be called
  (crystals are never spent for nothing).
- Adding a banner is adding an entry to `banners`; the order of entries is
  the order they run. Characters on a banner come from no quest.

## A call

One call costs `price` (200 crystals). It brings one of three things,
rarest first (one roll for the character, one more for the rest):

| Light | Result | Odds |
| --- | --- | --- |
| Gold | **The focused character** | 1%; from the 32nd call since the last character, 8% more each call; certain at the 45th |
| Purple | **A rare thing: an aspect or a look not owned yet** (an aspect no quest gives, a look only the Call gives, one pool) | 6% of the calls that bring no character; certain by the 20th such call since the last rare thing |
| White | **Sigils** (`sigils`: 1) | the rest |

With the guarantee counted in, a rare thing comes on about 8.4% of calls
(`effectiveRareRate`): in ten calls, none 35% of the time, one 48%, two
14%, three or more 3%. That is the feel wanted: a purple is a gift, one
if lucky, two if very lucky, never the rule.

- **The first character** the Call brings comes within 25 calls (instead of
  45): the beginner's guarantee, landing in chapter 5.
- **No character, aspect, or look comes twice**: the character odds hold
  while the banner has someone left, the rare odds while the pool has
  something. With the pool empty, every call that brings no character
  brings sigils (and the Rates tab says so).
- **The guarantees count every call**, across banners: switching banner or
  focus never loses progress. A character in between neither resets the
  rare count nor adds to it (Genshin's rule: a 5★ never touches the 4★
  pity), and a rare thing does not reset the character count. The screen shows how many
  calls at most until a character, and until a rare thing.
- **The draws are saved**: each account draws from its own seed, saved with
  it, so a result is fixed when it is made (reloading never draws again).
- The last 60 calls are kept as the **history**.

## Sigils and the exchange

A **sigil** is the Call's own token: a white call leaves one, and nothing
else makes them (a currency in the wallet, `sigils`). They are kept across
banners and spent in the Call's **exchange**, which sells any aspect or
look of the Call's not owned yet: **an aspect for 40, a look for 20**
(`exchange`). Never a character: the character comes from the gold light
alone, so the pace of characters is the pity's and nothing else's.

The exchange is the sure road to the purple tier, and the slower one: a
pulled aspect comes about every 25 calls (aspects are 5 of the 12 in the
pool today), a bought one about every 45. Buying is the one decision the
sigils ask: an aspect now, or two looks. What is bought leaves the pool,
like what is pulled.

Why a token and not gold or material: a supply's worth drifts with the
account's level (400 gold is a run at level 5 and nothing at level 50),
while a sigil's is anchored to what it buys.

## Pace

Characters are the Call's rare prize, as in Genshin: **the first in
chapter 5**, and each one after more slowly, in the ranks' replays (an open
number, measured by `pnpm calls`: it plays the quest line at a fixed number
of runs per quest, then the rank II and III replays, and calls with
everything earned, buying from the exchange what its sigils pay for, many
times over, and reports when characters come).
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
what else calls bring by then: by chapter six, about 2–3 of the 12 rare
things pulled and one bought, 31 sigils earned; by the rank III replay,
about 5 pulled and 2–3 bought, 4 of the 12 left.

## On screen

- **The Call screen** (Home, "Spirit Call"): the banner's name, theme, and
  when it ends; its characters, one focused (tap another to focus her); the
  focused character's model and what she does (her element and class, her
  special and ultimate), with **Try** (the Training Ground with her, before
  calling); the calls held, the guarantees, Call ×1 and Call ×10. Tabs:
  the banner; the rates (every rate, the rate with the guarantee counted
  in, what is left to get); the exchange (sigils held, every aspect and
  look of the Call's with its price, or yours); the history.
- **The seal**: a call shows a stone seal at once, while the server works
  out what it brought. Hold it (or swipe up, or skip) and it cracks, the
  light coming through it white; until the answer is in, it holds nearly
  broken, straining. Once broken (and at least a moment and a half after
  it showed), the light rises to tell the best result, honestly: it stays
  white (sigils), or turns purple (an aspect or a look), or goes through
  purple to gold (the room dims, a pulse, a sting), and a gold light
  turns her element's colour as it bursts. A call the server could not
  make crumbles back to stone, and no crystals are spent. It bursts, and
  each result shows in turn, the best last: a character arrives as her
  model, with what she does, **Try** and **Party**; an aspect or a look
  as its card; sigils as their count. A ten-call ends on all of them in a
  row. Skip goes to the next result that is not sigils, then to the row.
- Sounds and a short vibration (where the phone allows it) mark the crack,
  the light rising (purple, gold), the burst (or the crumble), and a
  character.

## Open

- Character and aspect duplicates and what they turn into (skins, look
  variants), once there is something to turn them into; sigils are the
  natural currency for those.
- More banners as characters come; the rotation's length.
- The pace, once played: the price, what quests and chests pay, and the
  exchange's prices.
