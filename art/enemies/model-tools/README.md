# Enemy model and animation review tools

The model stage of `docs/spirits.md`, adapted for the Warden, Stalker and
Volatile sheets. Each enemy has an independent `production/` folder with
the preserved sheet, labeled config, measurements, build recipe, editable
Blender file, static GLB, renders and verification. Approved animation and
game exports are saved in a separate `production/animated/` folder.

For interactive 3D inspection, run `pnpm dev --host --port 5199` and open
`http://localhost:5199/art/enemies/warden-stalker-volatile-review.html`.
Choose an enemy, drag to orbit, scroll or pinch to zoom, or use the camera
and wireframe buttons. Add `?kind=stalker` or `?kind=volatile` for a direct
model link. The page loads the saved static GLBs and reference images.
Add `?animated` to inspect the game GLBs, select a clip, or pause its pose.
The attack sequence options play windup, contact and recovery using the
current content timings, including Stalker's separate blink sequence.
The scrub slider pauses playback and lets you inspect any point in a clip
or a complete attack.
The Face close-up button centers the camera on the eyes; the comparison
selector also includes the rendered face close-up.

These tools use the tracked `production-tools` recipes as their starting
point. They do not depend on changes to other enemies' production helpers.
The only shared measurement dependency is `art/spirits/tools/common.py`'s
connected-component reader.

- `prepare.py`: preserve and crop a sheet, label regions and measure them.
- `measure.py`: masks, row outlines, ribbon columns, eye blobs and swatches.
- `geometry.py`: measured lofts, open hoods, projected eyes, trim and cloth.
- `render.py`: read a saved source, render canonical views and a 30-degree
  game camera, and search hero and labeled-view camera orientations. Frames
  expand when needed to keep every vertex inside the image.
  The `face` mode renders front and oblique face close-ups.
- `review.py`: score cameras and silhouettes, draw overlays, and assemble
  comparisons and native pixel-size studies. The 90% target remains visible
  in the score files even when a candidate does not meet it.
- `verify.py`: check the actual GLB and import it back into Blender to compare
  its geometry and bounds with the saved source. No source is rebuilt.
  Revised models also check Volatile's mirrored parts and socket depth,
  and Stalker's removed crests and retained connecting joints.
- `overview.py`: compose the three game-camera renders for the handoff.

Commands for each model are in its README. Blender 4.5 LTS and `uv` are
required; image tools use `uv run --with pillow --with numpy`.
On this Mac, substitute `/Applications/Blender.app/Contents/MacOS/Blender`
for `blender` in the commands if Blender is not on your shell's PATH.

Measurements retain the sheet's perspective and pose disagreements. The
source recipes explain deliberate simplifications rather than silently
changing the reference. Static GLBs keep separate editable parts and one
vertex-color material. Enemy batching needs one skinned mesh after review.
The animated export preserves every approved rest vertex to within one
millionth of a meter, joins the parts into one vertex-color mesh, and gives
the game a shared animation atlas. It never rebuilds the approved sources.

- `animate.py`: rig an approved model and export its game GLB and TypeScript
  metadata. Run with `-- <kind> build-export` in Blender.
- `verify-animation.py`: check every sampled frame after a fresh GLB import,
  root motion, phase continuity, rest bounds, triangle and bone budgets.
- `render-animation.py`: render the saved source's game-camera action poses.
- `animation-board.py`: compose those poses into the animation review board.

See `../warden-stalker-volatile-integration.md` for the runtime wiring and
validation. Phone viewport checks do not claim physical-device performance.
