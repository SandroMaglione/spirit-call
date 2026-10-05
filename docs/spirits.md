# Spirits

In the arena each character shows as her **spirit**: a small, faceted,
low-poly creature of her element (water, fire, wind, thunder, or rock). Her
illustrations, story, and portrait live in the menus; the spirit is what
moves, fights, and is hit. This records how a spirit goes from a character
sheet to the game, and the principles that made it work, so the next one is
a repeat of the same steps. The rules for model files in general are in
`models.md`; the spirits' scripts are in `art/spirits/`.

## Principles

1. **Measure, never fit by eye.** Every shape comes from the sheet's pixels:
   outlines row by row, eyes and floating parts by their pixel blobs, colors
   from the swatches. Hand-typed profiles drift a little each round and
   never converge; measured ones match the first time.
2. **Loft through the true views.** Each ring of the body takes its section
   at its height: its width from the front and back views, its depth from
   the left and right views, each ring an ellipse round that section's
   center (not four separate extents, which fold over where the shape leans
   past its middle). The body's lean, bulges, and tip are then the sheet's
   own.
3. **Check by laying one on the other.** Render the model from each of the
   sheet's cameras and lay it on that view, outlines and overlap scored
   (`tools/overlay.py`). Side-by-side pictures hide differences; overlays
   do not. Aim for 90% or more on the front, back, left, and right views.
4. **Find cameras, do not assume them.** When a view is not a plain
   orthographic one (an isometric render, a turned "front"), render the
   model from many cameras and keep the one that matches it best
   (`tools/sweep_score.py`). Sheets drawn by hand or by an image generator
   are often turned a little or drawn from a different height.
5. **Symmetry where it reads.** A face is centered and its eyes are
   mirrored (one size, averaged from the sheet), even if the drawing is a
   little lopsided; the flame, the tip, the curl keep the sheet's
   asymmetry.
6. **Eyes are their own objects, drawn on the surface.** Each eye is a thin
   ellipse whose every point is snapped onto the body, 2 mm above it, along
   the eye's outward direction: it reads as drawn on from every side (a
   projected texture smears across side facets; a separate solid sinks in
   or sticks out). Named `Eye.L` and `Eye.R`, origin at the eye's center:
   blinking is scaling, looking around is moving. Their shape is the
   character's (`EYE_SHAPE` in `build.py`, over the sheet's ellipses:
   wider, lidded, slanted): two characters of one mood should not look
   alike. The game holds them wide or shut at moments of the fight
   (`eyes` in her look).
7. **Floating parts are their own objects** (the water spirit's nub, the
   fire spirit's shards), so they bob, sway, and trail on their own.
8. **Faceted color is per facet, glow is the game's.** Each facet gets one
   flat color (vertex colors) from the swatches, varied a little. What
   depends on the view (a rim at the silhouette, a glowing core, a halo)
   cannot travel in glTF: the game draws it (`glow.ts`, a `GlowSpec` per
   model), and the export keeps only a flat emission.
9. **Animate objects, not bones.** A spirit has no skeleton: its clips
   key the body's location, rotation, and scale and its parts'
   (`animate.py`), one muted NLA track per object, exported together.
   Loops (`Idle`, `Run`) leave out their closing key, as every model's do.
   Its combat clips (a combo's blows, the charged move, the dash, a hit
   taken, the special, the ultimate) are the same for every spirit
   (`tools/moves.py`), shaped by a `STYLE` in its `animate.py`: how its
   character strikes (a lunge for a blade, a kick back for a gun). A blow
   may wind up (its `contact` pose is timed to the simulation's blow), but
   a skill takes effect the moment it is cast: its clip leaves the ground
   by its second frame, with no crouch first, or the leap comes after the
   effect.
10. **The body says how she is.** On a phone the eyes are on the
    character, not the HUD, so what matters shows on her: her halo pulses
    brighter while her ultimate is ready and dims as her health runs low,
    she pops up when she comes onto the field, and her eyes narrow through
    a blow, go wide after a perfect dodge, and shut when she falls. Her
    body also leans with her changes of pace (digging in as she stops,
    into a turn, kicking up dust from full speed), and falling she is left
    behind for a moment, tipping back and fading, before the next one pops
    up (`view.spirit`, `DrawPlayer`, `PlayFalls`). All of it is the
    presentation's: the simulation switches at once, as before. A new spirit gets all of this from its
    halo (`GlowSpec`) and its look's `eyes`; nothing is built per spirit.
11. **Its back says which way it faces.** The camera sees the arena from
    one side, so facing away a spirit shows no eyes. Four things say it
    anyway, and a new spirit needs them all: something only its back has
    (Water's tail, Thunder's bolt down its back, Fire's curl, Wind's
    trailing leaves), floating parts that rest off-center front to back in
    its `Idle` (Water's nub behind its tip, Thunder's ring tipped down in
    front), a very few of its trail's particles still leaving its back
    while it stands (`view.spirit.standing`: small, slow, and rising, never
    falling at its feet), and a lean toward its aim when that is
    away from the camera (`view.spirit.sway.aim`). Check it in the game
    aiming away, sideways, and toward the camera.
12. **Model first, then the game.** Each spirit is built and reviewed as a
    model against its sheet (overlays, renders from the game's camera, at
    game size) before it gets clips, glow, a trail, and its look.

## What a sheet needs

- **Orthographic views at one scale on one ground line:** front, back,
  left, right, top, bottom. The front looks straight at the face (eyes
  centered); left shows its front on the image's right, right on the left.
- **A plain dark background** and a body color that stands out from it (so
  a color mask finds the body exactly); glowing or dark eyes, clearly
  separate from the body.
- **An isometric render** of how it should look in the game (ideally from
  the game's camera, 30° down; otherwise the sweep finds its camera).
- **Swatches** with hex values, and the overall height (meters).
- Helpful: measurements (height, width, depth, parts), cross-sections.
- When views disagree (a top view narrower than the front, an isometric
  tip taller than the side views), say which one wins; otherwise the
  orthographic side views do.

## Steps for a new spirit

From the repository root, with Blender 4.5 LTS and `uv`; `<spirit>` is its
folder under `art/spirits/`. Choose the closest example below.

1. **Reference.** Put the sheet in `<spirit>/reference/sheet.png` and crop
   its views into `front.png`, `back.png`, `left.png`, `right.png`,
   `top.png`, `bottom.png`, `hero.png` (the isometric render), each with
   the whole figure and some background.
2. **Config.** Write `<spirit>/spirit.json` (see `tools/common.py`): its
   Blender file, the mask color (`blue`, `orange`, or `mint`; add one to `MASKS`
   for a new color), its eyes (`light` or `dark`), the sheet's background,
   the render lights, and where to search for the isometric camera.
3. **Measure.** Write `<spirit>/sheet.py` from the closest example: it
   writes `sheet.json` (outlines, eyes, floating parts). Water measures a
   body with a floating nub and glowing eyes; fire a body with a nub under
   a neck, floating shards, and dark eyes (holes); wind a ball (an ellipse
   fitted where its outline meets the background) with parts growing from
   it: leaves (base, tip, widths) and curling tendrils (a middle line and
   its widths, matched between the views point by point).
4. **Build.** Write `<spirit>/build.py` from the closest example: loft,
   eyes, floating parts, facet colors. It writes `<spirit>-spirit.blend`.
5. **Fit the isometric camera and check:**

   ```sh
   uv run --with pillow --with numpy art/spirits/<spirit>/sheet.py
   blender --background --python-exit-code 1 --python art/spirits/<spirit>/build.py
   SWEEP=/tmp/sweep blender --background --python art/spirits/tools/render.py -- <spirit>
   uv run --with pillow --with numpy art/spirits/tools/sweep_score.py <spirit> /tmp/sweep
   blender --background --python-exit-code 1 --python art/spirits/tools/render.py -- <spirit>
   uv run --with pillow --with numpy art/spirits/tools/overlay.py <spirit>
   uv run --with pillow --with numpy art/spirits/tools/compare.py <spirit>
   ```

   Review `renders/overlay-all.png` and `renders/compare.png` (the sheet
   beside the model, and the game's camera) with the designer; iterate on
   `build.py` until they agree.
6. **Animate and export.** Write `<spirit>/animate.py` (an `Idle` of 60
   frames and a `Run` of 16, at 30 fps, and its `STYLE` for the shared
   combat clips; see the examples) and
   `<spirit>/export.py`, which writes `<spirit>-spirit.glb` and
   `src/presentation/assets/<spirit>-spirit.ts` (its spec: file, height,
   clips' timing). For a compact spirit, measure `height` from the ground
   origin to the highest rest-pose mesh vertex, including floating parts,
   before adding animation. This matches Water's existing arena scale.
   Record the measurement basis in the export metadata. Height is a
   uniform scale divisor, not a bound that clips ornaments.
7. **Into the game:**
   - export its model from `assets/spirits.ts` and register it in `models`
     (`models.ts`) with its `GlowSpec` (rim, optional core, halo, eye
     glows: the eye nodes by their Blender names);
   - give its character a look in `looks.ts`: `kind: "model"`, its model,
     `moments: spiritMoments(...)` (her combo's length, her special, her
     ultimate), her `eyes`, and its
     trail (`drops`, by `kind`: water drops falling and rippling, `"ember"`
     drifting up and burning out, or `"wisp"` curling away and fading);
   - compare the loaded model with Water and Fire on one ground line,
     with the same look factors, camera, facing, and animation phase.
     Compare both the full silhouette and the central body's width;
     equal sheet dimensions or equal look factors do not guarantee equal
     arena size. Exclude runtime glow sprites from measured bounds;
   - `pnpm check`, then play it on the network address (desktop and a
     phone-sized screen with touch) and record it moving, striking
     (every blow of its combo, the charged move, the dash, its special and
     ultimate), and switching to an existing character. Keep that size
     comparison with the review. Check the address the dev server prints:
     when its port is taken (another session's server) it starts on the
     next one, and the old address shows someone else's branch.

## References to start from

Read `vision.md`, `models.md`, and this guide before changing a character.
Then read the chosen spirit's README and inspect its sheet, current GLB,
and gameplay look. A sheet establishes its shape; the current game also
includes deliberate changes for personality and readable facing.

| Character | Source and review notes | What to copy |
| --- | --- | --- |
| Tidecaller, water | [Water](../art/spirits/water/README.md) | Measured loft, glowing surface eyes, winding throws, tail fin and offset nub for rear facing |
| Gunner, fire | [Fire](../art/spirits/fire/README.md) | Flame and separate shards, dark slanted eyes, recoil on shots, warm core and ember trail |
| Swordsman, wind | [Wind](../art/spirits/wind/README.md) | Pale body, tapered curls and trailing leaves, narrow eyes, lunges and spinning finishers |
| Stormcaller, thunder | [Thunder](../art/spirits/thunder/README.md) | Gold wings and back bolt, round eyes with blinking rims, tilted halo rotating about its own axis, restrained casting hops |
| Bastion, rock | [Rock](../art/spirits/rock/README.md) | Broad grounded boulder, round optimistic eyes, weight-bearing feet, short rear heel, floating ornaments, planted Disc recoil and ground slam |

Each folder keeps `reference/sheet.png`, cropped views, measurements,
`build.py`, an editable `.blend`, `animate.py`, `export.py`, and its GLB.
`renders/` contains model comparisons and, where recorded, gameplay and
scale reviews. Those images and videos document the pass that produced
them. They do not automatically update when the model or game changes;
record fresh evidence for the version under review.

The shared combat poses and contact frames are in
`art/spirits/tools/moves.py`. Each spirit's `animate.py` sets `STYLE`;
`build.py` sets `EYE_SHAPE`. Runtime wiring is in
`src/presentation/assets/spirits.ts`, `models.ts`, and `looks.ts`.
`puppet.ts` blends object animation and owns each copy's halo material;
`actors.ts` applies eyes, aura, entrance, and movement sway;
`effects.ts` handles falls and trails; `showcase.ts` frames portraits.
Shared feedback numbers live in `src/config/view.ts` under `spirit`.
Changing them affects every character, so compare the existing roster too.

## Review before calling a character finished

Start a server from the intended worktree with
`pnpm dev --host --port 5199 --strictPort` and use its printed network
address. `--strictPort` fails if another worktree already owns that port;
choose another port explicitly. For a quiet review use
`?play&challenge=trainingGround&team=gunner,swordsman,tidecaller`;
repeat with `team=stormcaller,tidecaller,swordsman` to cover Thunder.
`&touch` also lets the mouse drive the touch controls. Use actual or
simulated touch events for the phone check, and record which was used.

| Check | What must read at gameplay size |
| --- | --- |
| Shape and facing | Compare full height and central body width with Water and Fire on one ground line. Aim toward, across, and away from the camera, both still and moving. Back details and offset parts must distinguish facing without eyes. |
| Locomotion | Idle breathes without wandering; run has weight; starting, stopping, and reversing lean and settle without a snap. Stationary particles stay sparse and rise rather than pile up at the feet. |
| Attacks | Exercise every combo step and charged move, including interrupted chains. Contact poses coincide with hits, the final blow reads stronger, and recoil or lunge suits the character's kit. |
| Skills and dash | Special and ultimate move as their effects appear, with no late windup. Dash stretches along travel and returns cleanly. Gameplay movement and timing stay in the simulation. |
| Reactions | Take a hit, perform a perfect dodge, fill ultimate energy, and lower health. Check hurt motion, briefly widened eyes, the ready halo pulse, and low-health dimming. One copy's halo must not alter another's. |
| Switching and falling | Switch during locomotion and attacks. Let a member fall with a survivor, then let the last member fall. The fallen body shuts its eyes, tips, and fades; the survivor's entrance follows. Check movement and skill input during that entrance, pause/resume, and retry for leftover bodies or effects. |
| Portraits and touch | The whole spirit and both eyes fit in menu and party portraits. Repeat movement, attacks, skills, dash, and switching at phone size with touch input, with enemies and effects on screen. |

Run `pnpm check` and `pnpm build`. `test/looks.test.ts` verifies clip
registration, `test/puppet.test.ts` covers animation blending, and
`test/spirit-assets.test.ts` checks Thunder's scale and exported animation.
These checks cannot judge silhouette or combat feel; keep the browser
review with the PR. In the spirit's README record intentional departures
from the sheet, the scale measurement basis, character style, eye and part
names, review evidence and its commit, and any unverified cases. A physical
phone performance check is separate from a phone-sized browser review.

## Pitfalls met

- **glTF node names:** the loader turns `Eye.L` into `EyeL` (animation
  bindings cannot hold dots). Code that looks nodes up by name must use
  `PropertyBinding.sanitizeNodeName`.
- **Glow not exported:** an emission wired from vertex colors exports as a
  flat white glow that washes the colors out. The exporters set a flat
  emission in the body's base color instead; the rest is `GlowSpec`.
- **Trails in the overlay:** particles drawn on the flat effects layer show
  over the body, as if coming out of it. Spirit trails live in the 3D scene
  (`drop-trail.ts`), so the body hides those behind it.
- **Bounds with halos:** a halo sprite widens a model's bounds; the menu
  frames models without their glows (`showcase.ts`).
- **Inconsistent scale measurements:** Thunder initially used only its
  body's top (0.4015 m), while Water used its whole figure (0.6612 m).
  The game divides by this number, making Thunder's crest reach 1.66
  times Water's height despite identical look factors. Thunder now uses
  its whole figure's top (0.6650 m). Do not copy a body-only measurement
  without comparing the resulting silhouette with existing spirits.
  Fire's existing divisor excludes its highest shards and its full
  silhouette is about 19% taller than Water; preserve that established
  look as a comparison, not as an interchangeable measurement rule.
  If future ornaments float far above the body, review an explicit scale
  exception against these references and record its basis. Height alone
  cannot make differently proportioned bodies have equal widths.
- **A turning part modeled tilted:** Thunder's ring is built tilted; turned
  about the floor's axis it wobbles like a coin. Turn such a part about its
  own axis (`HALO_AXIS` in Thunder's `animate.py`).
- **A ring seen edge-on:** a sheet may draw a floating ring as an open
  ellipse from the front and from the sides; a real ring cannot be both.
  Follow the front and the game's camera, give it thickness (a hairline
  vanishes at game size), and accept the lower side scores.
- **A clip that never moves an object has no track for it:** the exporter
  drops constant tracks (the dash keeps the body on the spot), so code and
  tests must not expect every clip to have every track.
- **Portraits cropped to the head:** the party list and the menus draw a
  character's portrait (`showcase.ts`). Cropped to the top of the figure,
  as for a person, a spirit shows only its crest: its eyes sit low. A
  portrait shows all of her, nearly facing the camera.
- **Halos are shared by copies:** a copied model shares its glow sprites'
  material; a body whose halo changes with its state needs its own
  (`copyModel` gives a puppet one).
- **Sheets that disagree:** score every view and report which ones the sheet
  itself contradicts, instead of bending the model to fit all of them.
- **Parts crossing the body:** a view loses a part's root where the body
  hides it, or where it lies over the body in the body's color; root it on
  the body's surface yourself (the wind spirit's horns grow from its sides).
- **Pale spirits and glow:** a light palette washes out under a strong rim
  or core; keep the `GlowSpec` low and in the darker swatch (wind: teal).
