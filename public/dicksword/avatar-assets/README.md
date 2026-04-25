# Dicksword Avatar Assets

Drop paper-doll PNG assets here over time. Files in `public/` are served from
the site root, so this folder maps to:

```text
/dicksword/avatar-assets/
```

Recommended folders:

```text
base/          body/base models
hair/          hair layers
face/          eyes, mouths, expressions
clothes/       shirts, jackets, costumes
accessories/   hats, glasses, handhelds, badges
effects/       glows, stickers, overlays
```

Layer rules:

- Use transparent PNGs.
- Keep every layer on the same canvas size, for example `1024x1024`.
- Lower stack orders render first. Suggested ranges:
  - base: `0`
  - hair/face: `20-39`
  - clothes: `40-59`
  - accessories: `60-79`
  - effects: `90+`
- Register each asset in the Dicksword admin panel with its public URL, for
  example `/dicksword/avatar-assets/accessories/example-hat.png`.
- Add conflicts in the admin panel for mutually exclusive layers, such as two
  hats, two hairstyles, or two base models.

Use `manifest.example.json` as a planning template. The app reads layer metadata
from the database, not directly from the manifest, so you can add art gradually
without code changes.
