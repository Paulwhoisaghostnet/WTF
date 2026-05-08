# Industrializer Source Map

Source URL: `https://ipfs.io/ipfs/bafybeibdr7qfnx76t37iymhl5nja7yfis4ezt3mamlgsvqdzle6pcodyzi`

Local snapshot: `../jack-industries-ipfs-bafybeibdr7qfnx76t37iymhl5nja7yfis4ezt3mamlgsvqdzle6pcodyzi`

WTF target: `public/creation-tools/industrializer`

WTF route: `/tools/industrializer`

## Current Finding

The WTF copy already contained matching `index.html`, bundled JS/CSS, and `worker.png`.
This pass added the runtime assets referenced by the bundle:

- `background.gif`
- `fonts/SyneMono-Regular.ttf`
- `start.ogg`
- `message-01.ogg`

Verification:

- `npm run creation-tools:check`
- `npm run check`
