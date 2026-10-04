# Spirits

In the arena each character shows as her **spirit**: a small, faceted,
low-poly creature of her element (the water, fire, and wind spirits). Her
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
   character strikes (a lunge for a blade, a kick back for a gun).
10. **Model first, then the game.** Each spirit is built and reviewed as a
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
folder under `art/spirits/` (the water, fire, and wind spirits are the examples
to copy).

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
     phone-sized screen with touch) and record it moving and switching
     to an existing character. Keep that size comparison with the review.

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
- **Sheets that disagree:** score every view and report which ones the sheet
  itself contradicts, instead of bending the model to fit all of them.
- **Parts crossing the body:** a view loses a part's root where the body
  hides it, or where it lies over the body in the body's color; root it on
  the body's surface yourself (the wind spirit's horns grow from its sides).
- **Pale spirits and glow:** a light palette washes out under a strong rim
  or core; keep the `GlowSpec` low and in the darker swatch (wind: teal).
