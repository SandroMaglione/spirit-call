# Character sheets

What to hand over for a character so that an agent can build her in-game
model (mesh, face, rig, and moves) without guessing. It comes from the
Abigail study (`art/characters/abigail/`, see its guess log): a
professional sheet with three views settled her height, body, silhouette,
and colors, and left the rest to guesswork. Like `vision.md`, this
records the rules; how a model file must be built is `models.md`.

## How she is seen

Write the sheet for the two places she appears:

- **The arena:** 20 to 35 CSS pixels tall, seen from above at 30° (the top
  of her head and her shoulders take more of the picture than her face),
  cel-shaded with a dark outline. Here she is her silhouette, her hair,
  her two or three main colors, and her weapon.
- **The menu:** a few hundred pixels tall, turning slowly, lit with a rim
  in her element's color. Here her face and hair show.

Illustrations, story art, and close-ups are separate; the sheet is only
for the model.

## Required

1. **A turnaround: front, side, and back**, at the same scale on one
   ground line, standing upright and neutral, arms hanging clear of the
   body (about 30° out) so their length shows. Every view shows
   everything she wears, including what hangs behind her; nothing is left
   out of one view because it is awkward to draw.
2. **A view from above:** three-quarter, about 30° down, like the game's
   camera. The crown of her head, her hair's parting, and her shoulders.
3. **A flat palette:** each material's base color and shadow color as hex
   values (skin, hair at the root and at the ends, each fabric, metal),
   plus which colors identify her at a glance (two or three).
4. **A face sheet:** front, three-quarter, and profile, drawn large; her
   eye drawn on its own (lashes, iris, highlight), and her brows and mouth
   at rest.
5. **A hair sheet:** from above and from behind, its locks numbered, with
   which ones move (they get bones) and which are a fixed mass.
6. **Outfit notes:** how it is built (which pieces are one, what attaches
   where) and what is stiff and what flows (capes, ribbons, tails get
   bones).
7. **Her weapon**, at scale beside her, and in her hand (how she holds it).
8. **Proportion and priority:** her height in heads (the game draws heads
   about 10% larger than a 7-head page figure to read at arena size; say
   if that is not wanted), and the three details that must survive at 30
   pixels.
9. **How she moves:** three or four key poses (her stance, a strike, her
   power move) and a line on her temperament. The game's timings decide
   the moves' lengths; the poses decide their character.

## Format

- One image per view, at least 2,000 pixels tall, on a plain background,
  nothing (logos, watermarks, text) over the figure.
- Views exactly aligned: same height, same ground row. Proportions are
  measured from pixel rows.
- Shading and line art are welcome in the illustration; the palette must
  be flat.

## What each input is used for

| Input | Used for |
| --- | --- |
| Turnaround (front, side, back) | Every height, width, and depth: the body's cross sections, the outfit's shapes, the overlay check against the sheet |
| View from above | The crown and shoulders, which the arena camera sees most |
| Flat palette | The texture's color cells and the cel shading's two tones |
| Face sheet | The face texture (painted, projected from the front) |
| Hair sheet | The hair's locks and their bones |
| Outfit notes | Which parts are separate pieces, and which follow her with a spring |
| Weapon | Its model, and the grip on her hand's bone |
| Proportion and priority | The head size, and what to keep at arena size |
| Key poses | Her guard, combo, power move, and dash |
