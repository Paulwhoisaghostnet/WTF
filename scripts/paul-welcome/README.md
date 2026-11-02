# Paul welcome video

`storyboard.json` is the editable copy and scene source. `narrate.py` renders local Kokoro-82M narration (voice `am_puck`) and caption timing. `build.mjs` renders vector title cards, animates `public/desktop/paulwhoisaclippy.svg`, and packages a self-hosted H.264/AAC MP4, WebVTT captions, and PNG poster.

From the repository root:

```sh
node scripts/paul-welcome/build.mjs
node scripts/paul-welcome/validate.mjs
```

The first build installs Kokoro 0.9.4 and the English tokenizer into the ignored `output/paul-welcome/.venv` and may download the Kokoro model. After that, `node scripts/paul-welcome/build.mjs --offline` builds without network access. The build uses `uv`, `rsvg-convert`, `ffmpeg`, and `ffprobe`. Temporary WAV, SVG, PNG, and segment files are written to ignored `output/paul-welcome/`. The served files are `public/desktop/paulwhoisaclippy-welcome.mp4`, `.vtt`, and `-poster.png`.

The video introduces real desktop controls. The Reggie scene server-renders the same `HamsterPixelSprite.tsx` shape and palette used by his desktop companion, so the character matches what players click. It uses no account screenshots or user data.
