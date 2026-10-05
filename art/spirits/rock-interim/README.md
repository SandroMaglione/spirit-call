# Rock Spirit (interim)

Bastion's spirit in the game until the Rock Spirit under review in
`art/spirits/rock` (branch `art/rock-spirit-static`) is approved and
animated there.

- `static.glb`: that model as committed for review (38470d1), untouched.
- `export.py`: imports it in Blender, keys a grounded idle (breathing,
  its stones floating out of step, a blink) and a heavy waddling run on
  its objects, adds the combat clips every spirit shares
  (`../tools/moves.py`, a planted disc-throwing style), and writes
  `rock-spirit.glb` and `src/presentation/assets/rock-spirit.ts`.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python art/spirits/rock-interim/export.py
```

When the reviewed spirit is animated in `art/spirits/rock`, point
`rockSpiritModel` there and remove this folder.
