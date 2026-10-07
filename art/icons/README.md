# Game icon

`wind-spirit-halo.png` is the approved painted wind spirit with the padded
halo composition. Keep this square source intact when exporting. The
background is opaque; platforms apply their own icon masks.

The browser uses `public/icons/icon-32.png`, Apple uses
`apple-touch-icon.png`, and the web manifest uses the 192px and 512px
exports. `icon-1024.png` is available for store packaging.

Regenerate the exports from the repository root on macOS:

```sh
sips -z 32 32 art/icons/wind-spirit-halo.png --out public/icons/icon-32.png
sips -z 180 180 art/icons/wind-spirit-halo.png --out public/icons/apple-touch-icon.png
sips -z 192 192 art/icons/wind-spirit-halo.png --out public/icons/icon-192.png
sips -z 512 512 art/icons/wind-spirit-halo.png --out public/icons/icon-512.png
sips -z 1024 1024 art/icons/wind-spirit-halo.png --out public/icons/icon-1024.png
```

The approved Spirit Call seal is implemented in `src/ui/EmblemIcon.tsx`.
Its gradients and clip path use each component's `useId` so multiple seals
can appear together.
