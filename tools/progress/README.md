# Player journey report

A design aid, not part of the game: a page that projects how a new account
grows through the game (character levels, farming, gold, crystals, essences,
main quests cleared), computed from the game's own numbers and account
rules, with the numbers editable on the page to see how a change moves the
journey. It answers questions like "how many hours until rank 2?", "where do
players have to farm?", or "what does doubling first-clear gold do?".

It is dev only: open `/tools/progress/` on the dev server
(`pnpm dev --host --port 5199`, then `http://localhost:5199/tools/progress/`).
`vite build` never includes it, so it is not deployed.

## Where the numbers come from

Nothing here is a copy. The page reads the shipped tuning (`defaultTuning`)
and plays a new account through `test/progression-model.ts`, the same model
`pnpm progression` and `pnpm expected` use, which in turn calls the account's
own rules (`recordRun`, `train`, `ascend`). Change content or rules and the
report follows; `pnpm check` typechecks, lints, and tests it
(`test/progress-report.test.ts`), so it cannot silently fall behind.

The model's player plays every quest at every rank as it opens, trains her
first three characters evenly with all her gold, ascends as soon as she can,
and farms (the best quest cleared, or her element's trial for essences)
until the team's average level reaches the next quest's enemies. Once a week
she clears the hardcore tiers within reach. She never spends crystals and
earns only a quest's first two stars.

## Reading it

- The x-axis is hours played: every run (hardcore ones too) at "Minutes a
  run" (4, the vision's run length). "Runs a week" only paces the weekly
  hardcore rewards.
- The line is an efficient player who never loses. The shaded range runs
  from a skilled player (goes in a few levels under the enemies, rarely
  loses) to a struggling one (waits above their level, loses often); each
  loss pays its share of gold. All three are editable.
- Gray dashed lines are the shipped numbers, so an edit shows as the gap
  between them and the colored lines. The tiles give the same deltas.
- Treat the hours as a projection to compare numbers by, not a promise:
  the model does not choose characters, chase stars, or pull on banners.

## Changing numbers

The left panel edits a tuning patch (`tuningWith`), never content; "Copy
patch" exports it for `pnpm balance --tuning`. The state lives in the URL, so
a link reproduces it. To move a number into the game, edit the content as
usual and check it with `pnpm progression`, `pnpm balance`, and play.

To offer another number, add an entry to `knobs` in `knobs.ts` (a path in the
tuning, or a multiplier over some entries); its default is read from the
shipped tuning. `journey.ts` follows the model run by run; `chart.tsx` holds
the charts; `main.tsx` lays out the page.
