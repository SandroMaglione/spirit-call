# Enemy UI illustrations

`roster.png` is the complete supplied Hand-Painted Fantasy Monster Roster,
preserved unchanged at full resolution. `roster-original.png` preserves the
earlier Low-Poly Enemy Roster Poster before the two new dummies were added.
`enemyPortraits` in `src/presentation/looks.ts` frames it with CSS backgrounds.
Cards and round enemy indicators share each crop. No new artwork is generated.
Faces, upper bodies and identifying equipment fill the frame; labels and panel
borders stay outside it. Compact creatures show most of their body.

The complete poster covers all twelve combat enemies and all three training
targets. Heavy Dummy's crop shows its blue target and iron shoulder weights;
Sparring Dummy's crop shows its red padded striking arms and red target.
The Firebomber illustration maps to the permanent content id `charger`.

Differences to review against the current models and individual reference sheets:

- Sniper: the poster's upright figure has a shorter, downward-pointing weapon;
  the model has a long horizontal barrel and a wider stance.
- Firebomber: the poster has a humanoid head and round glowing belly;
  the model has a low hooded head beneath a large flaming bomb pack.
- Gale Caster: the poster omits the staff carried by the model.

The rest of the poster matches the roster's main colours and identifying shapes.
The illustrations do not change arena models or gameplay.

## Verification

`pnpm check --maxWorkers=2` passed: 59 test files, 483 tests passed and one
skipped. `pnpm build` passed with the existing chunk-size warning.

Browser review used `http://192.168.40.47:5199/` at 1280 × 800,
844 × 390 and 667 × 375. Practice cards, the three training target portraits,
the home screen's round indicators and the challenge's small cards were
inspected. A synthetic touch pointer tap followed by its click selected
Sniper and opened its facts. Native browser clicks also opened enemy facts.
No console errors were reported. This is browser evidence, not a physical
phone review. UI animations were temporarily disabled for stable screenshots.

- [Practice at 844 × 390](evidence/phone844.png)
- [Practice at 667 × 375](evidence/phone667.png)
- [Round indicators at 667 × 375](evidence/home667.png)
- [Challenge cards at 667 × 375](evidence/quest667.png)
- [Desktop practice](evidence/desktop.png)

The earlier screenshots above precede the complete sheet. The updated training
portraits are shown in [844 × 390](evidence/training844.png) and
[667 × 375](evidence/training667.png).
Both dummies' facts opened correctly, including a synthetic touch tap on Heavy
Dummy. Checks and the build passed again after the sheet update.

The preview stores screenshots at a larger display resolution while preserving
the tested viewport's proportions.
