# objkt Owned Editions Sorter (Chrome Extension)

Private, personal-use Chrome extension that adds sorting options on `objkt.com` owned pages.

## What it does

- Adds an **Owned Sort** control on profile `owned` pages.
- Sort options:
  - `Default`
  - `Most editions owned`
  - `Fewest editions owned`
- Keeps a stable original order so you can always go back to default.
- Works with dynamic/infinite scrolling pages by watching DOM updates.

## Install (unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:
   - `/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/objkt-owned-editions-sorter`

## Use

1. Open an objkt owned page, for example:
   - `https://objkt.com/profile/<your-wallet>/owned`
2. Use the **Owned Sort** dropdown.
3. Click **Refresh** after new cards load if needed.

## Notes

- The parser uses several heuristics to extract owned edition counts from card text/datasets.
- If objkt changes markup, the extension may need selector/parser updates.
- This project is local and personal-use oriented (no telemetry, no remote services).
