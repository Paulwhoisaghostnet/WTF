---
name: wtfOS
description: Browser-delivered Tezos OS with a retro desktop shell, ritual play, safe wallet flows, and living app organs.
colors:
  wtf-teal-desktop: "#008080"
  classic-window: "#c0c0c0"
  active-title: "#000080"
  active-title-text: "#ffffff"
  inactive-title: "#808080"
  inactive-title-text: "#c0c0c0"
  shell-text: "#111111"
  highlight: "#000080"
  canvas-white: "#ffffff"
  zine-outline: "#000000"
  aqua-close: "#ff5f57"
  aqua-minimize: "#ffbd2e"
  aqua-zoom: "#28c840"
  placeholder-text: "#595959"
typography:
  shell:
    fontFamily: "\"MS Sans Serif\", \"Segoe UI\", Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
  titlebar:
    fontFamily: "\"MS Sans Serif\", \"Segoe UI\", Tahoma, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0"
  control:
    fontFamily: "\"MS Sans Serif\", \"Segoe UI\", Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0"
  compact-label:
    fontFamily: "\"MS Sans Serif\", \"Segoe UI\", Tahoma, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  zine-label:
    fontFamily: "\"Arial Black\", Impact, \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0"
rounded:
  classic: "0px"
  zine: "2px"
  control: "6px"
  xp-window: "9px"
  aqua-panel: "12px"
  aqua-window: "14px"
  pill: "999px"
spacing:
  titlebar-edge: "3px"
  control-gap: "6px"
  content-classic: "9px"
  content-zine: "10px"
  content-xp: "11px"
  content-aqua: "12px"
  mobile-content: "6px"
components:
  window-classic:
    backgroundColor: "{colors.classic-window}"
    textColor: "{colors.shell-text}"
    typography: "{typography.shell}"
    rounded: "{rounded.classic}"
    padding: "{spacing.content-classic}"
  titlebar-active:
    backgroundColor: "{colors.active-title}"
    textColor: "{colors.active-title-text}"
    typography: "{typography.titlebar}"
    rounded: "{rounded.classic}"
    height: "27px"
    padding: "0 3px"
  button-classic:
    backgroundColor: "{colors.classic-window}"
    textColor: "{colors.shell-text}"
    typography: "{typography.control}"
    rounded: "{rounded.classic}"
    padding: "2px 8px"
    height: "32px"
  input-classic:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.shell-text}"
    typography: "{typography.control}"
    rounded: "{rounded.classic}"
    height: "32px"
    padding: "3px 6px"
  window-zine:
    backgroundColor: "{colors.classic-window}"
    textColor: "{colors.shell-text}"
    typography: "{typography.zine-label}"
    rounded: "{rounded.zine}"
    padding: "{spacing.content-zine}"
  window-button:
    backgroundColor: "{colors.classic-window}"
    textColor: "{colors.shell-text}"
    typography: "{typography.compact-label}"
    rounded: "{rounded.classic}"
    size: "20px"
---

# Design System: wtfOS

## 1. Overview

**Creative North Star: "The Haunted Community Machine"**

wtfOS is a product UI wearing the body of an inhabited desktop operating system. Its baseline is classic Windows 95 utility chrome: dense, square, tactile, readable, and immediate. The machine can become XP plastic, Aqua gloss, or zine print, but those skins are sanctioned operating modes, not excuses to abandon the shell grammar.

The interface should feel feral, ritualized, user-first, and accountable. Weirdness earns its place only when it creates ritual, discovery, feedback, social behavior, memory, provenance, or safer choices. A window, button, reward, cursor, pet, wallet prompt, admin tool, TV surface, arcade path, or social lane must tell the user what it is, what changed, what failed, and what happens next.

This system rejects normal, beige, sterile, VC-polished, dashboard-worshipping product design. It must never feel like a cloud account wearing a desktop mask, a generic SaaS admin console, a minimalist productivity app, a flattened marketplace, or a disconnected website with separate feature pages.

**Key Characteristics:**

- Desktop first: every major surface lives as a shell organ with placement, ownership, permissions, and feedback.
- Dense but legible: 13px shell type, short labels, visible chrome, and clear focus over oversized hero UI.
- Tactile controls: bevels, outlines, titlebars, hard shadows, and native-feeling affordances carry state.
- Purposeful weirdness: strange visuals must emit, teach, reward, connect, remember, or protect.
- WCAG 2.2 AA by default: visible focus, keyboard reachability, sufficient contrast, non-color-only state, reduced-motion respect, responsive behavior, and plain transaction explanations are required.

**The Organ Rule.** Every new UI surface must look placed inside the operating system, not pasted onto it. If it does not have shell placement, state feedback, and a clear consequence model, it is not finished.

## 2. Colors

The palette is role-bound retro color: a default teal desktop, gray window material, navy active chrome, white title text, gray inactive chrome, and high-contrast black shell text.

### Primary

- **WTF Teal Desktop**: The default operating-system field. Use it for the desktop background and spatial context, not for random decoration inside windows.
- **Active Title Navy**: The active window titlebar, current selection, focus-adjacent highlight, and shell-level action state.

### Secondary

- **Classic Window Gray**: The default material for windows, taskbars, menus, buttons, panels, and controls.
- **Inactive Title Gray**: Inactive titlebars and de-emphasized chrome. It must still read as reachable, not disabled.

### Tertiary

- **Aqua Stoplight Controls**: Close, minimize, and zoom colors are reserved for the Aqua window button variant. Do not generalize them into global semantic status colors.
- **Zine Black Ink**: The zine skin's outline, hard shadow, and print-grid ink. Use it when a surface is intentionally poster-like or sticker-like.

### Neutral

- **Active Title Text**: White text on active navy and high-saturation titlebars.
- **Shell Text**: Near-black product text for window bodies, buttons, controls, tables, and dense app content.
- **Canvas White**: Inputs, selected editable fields, high-contrast document areas, and small relief surfaces.
- **Placeholder Gray**: Input hint text only. It is not body copy and must maintain contrast against the field.

### Named Rules

**The Role-Bound Weirdness Rule.** Color schemes may be loud, but every color must keep its role: desktop, window, active title, inactive title, text, highlight, or button face. A color with no role is decoration and is prohibited.

**The Contrast Before Costume Rule.** WCAG 2.2 AA contrast wins over theme drama. If a custom scheme makes labels, titlebars, focus, disabled state, or wallet warnings unclear, adjust the scheme before shipping the screen.

## 3. Typography

**Display Font:** None for product shell use.
**Body Font:** "MS Sans Serif", with Segoe UI, Tahoma, Geneva, Verdana, and sans-serif fallbacks.
**Label/Mono Font:** The shell stack for controls; "Arial Black" and Impact only inside the wtfZine skin.

**Character:** Typography is compact, utilitarian, and operating-system native. The voice comes from placement, chrome, state, and copy discipline, not from decorative display type.

### Hierarchy

- **Titlebar** (700, 13px, 1.3): Window names, active app identity, and draggable shell chrome. It truncates rather than wrapping inside the titlebar.
- **Body** (400, 13px, 1.4): Default app text, settings text, form help, dense lists, status copy, and shell content.
- **Control** (400, 13px, 1.3): Buttons, inputs, selects, menus, tabs, and short command labels.
- **Compact Label** (700, 11px, 1.2): Window glyphs, tiny metadata, badges, table utility labels, and tight shell affordances.
- **Zine Label** (900, 13px, 1.2): wtfZine-only uppercase controls and labels. It is a skin treatment, not a global voice.

### Named Rules

**The No Hero Type In Windows Rule.** App windows are tools, not landing pages. Keep headings tight, keep letter spacing at 0, and avoid fluid type inside product chrome.

**The Label Legibility Rule.** Buttons, tabs, menu items, wallet prompts, admin actions, and errors must remain readable at desktop and mobile sizes. If a label does not fit, change the layout or copy instead of shrinking below usable size.

## 4. Elevation

Depth is structural. Classic 95 uses bevels and hard outlines; XP and Aqua add soft lifted shadows; Zine uses hard offset ink. Elevation identifies movable windows, active tools, menus, and pressed controls. It is not ambient atmosphere.

### Shadow Vocabulary

- **Classic Window Bevel** (`box-shadow: 1px 1px 0 #ffffff inset, -1px -1px 0 #808080 inset, 3px 3px 0 rgba(0, 0, 0, 0.48)`): Default window depth. Use for movable shell surfaces and durable chrome.
- **Classic Button Bevel** (`box-shadow: inset 1px 1px 0 rgba(255,255,255,0.9), inset -1px -1px 0 rgba(0,0,0,0.42)`): Default tactile button state.
- **XP Lift** (`box-shadow: 0 18px 32px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.82)`): Rounded plastic windows and menus.
- **Aqua Float** (`box-shadow: 0 24px 54px rgba(0,0,0,0.34), 0 3px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.92)`): Glossy floating windows and higher-emphasis modal-like shell surfaces.
- **Zine Ink Offset** (`box-shadow: 7px 7px 0 rgba(0,0,0,0.82)`): Printed zine windows and sticker panels.

### Named Rules

**The Bevel Before Blur Rule.** Default shell depth comes from bevel, border, and outline first. Soft blur shadows are allowed only in XP and Aqua skins or when the component is actually floating above the desktop.

**The No Ghost Card Rule.** Do not create translucent floating cards inside other cards. Use windows, panels, group boxes, rows, tables, menus, or direct content bands.

## 5. Components

Components are tactile, stateful, and accountable. Every interactive component needs default, hover, focus-visible, active, disabled, loading when relevant, and error when relevant. Focus must be a visible 3px outline in the highlight color with a 2px offset unless a stronger accessible treatment is intentionally defined.

### Windows

- **Shape:** Classic windows are square (0px). XP windows use rounded plastic (9px). Aqua windows use glossy rounded chrome (14px). Zine windows use hard print corners (2px).
- **Minimum size:** Desktop windows must not fall below 320px by 200px. Mobile windows become full-screen task surfaces.
- **Chrome:** Active titlebars use the active title role and focused copy. Inactive titlebars keep reachable contrast without pretending to be disabled.
- **Content:** Window content starts at 9px padding in Classic, 11px in XP, 12px in Aqua, 10px in Zine, and 6px on mobile.

### Buttons

- **Shape:** Buttons follow the current appearance mode: square Classic, 7px XP, pill Aqua, 2px Zine.
- **Primary:** Primary action uses the button face plus title/highlight state, not a separate marketing accent.
- **Hover / Focus:** Hover may adjust bevel, gradient, or title highlight. Focus-visible always stays obvious and keyboard-safe.
- **Active:** Pressed states must look physically depressed or moved. Zine buttons translate 2px and reduce their hard shadow.
- **Disabled / Loading:** Disabled actions need visible disabled text and must not rely on opacity alone. Loading actions keep size stable.

### Inputs / Fields

- **Style:** Inputs are white canvas in Classic, shaded inset fields in Aqua, and hard-outlined paper fields in Zine.
- **Height:** Desktop text controls start at 32px minimum. Mobile text inputs use 16px text and 44px minimum control height.
- **Focus:** Use the global 3px highlight outline. Do not replace focus with color-only border changes.
- **Errors:** Error copy must explain the consequence in plain language, especially for wallet, admin, privacy, sync, backup, media, and device-access flows.

### Navigation

- **Start Menu:** Menus are operating-system tools. Classic uses 258px width and 30px minimum item height; XP expands to 342px; Aqua uses 312px; Zine uses 298px with ink offset.
- **Command Palette:** Dense, keyboard-first navigation is appropriate. It must expose route identity, access state, and failure reasons.
- **Taskbar:** Taskbar buttons mirror window state and must never hide an active error or pending wallet consequence.
- **Mobile:** Collapse shell navigation into reachable full-screen task flows; do not preserve tiny desktop hit targets.

### Cards / Containers

- **Corner Style:** Use panels and group boxes before cards. If a repeated item is card-like, keep the radius tied to the current appearance mode.
- **Background:** Use window material, canvas white, or role-bound scheme colors. Avoid decorative tinted slabs with no state role.
- **Shadow Strategy:** Repeated items should not compete with window elevation. The window is the primary layer.
- **Internal Padding:** Use 9px to 12px for dense product panels; increase only when readability or touch targets require it.

### Status, Rewards, Wallet, and Admin Surfaces

- **Status:** State must not be color-only. Pair color with text, icon, position, or explicit copy.
- **Rewards:** Claimable, pending, failed, and granted rewards need visible provenance and audit trail.
- **Wallet:** Every value-bearing action needs provider, account, network, contract, entrypoint, amount, cost, and risk explanation before signing.
- **Admin:** Admin tools may be dense, but they must never become the default user path or visually dominate normal workflows.

### Signature Components

- **Desktop Icons:** Icons are launchable organs, not decorative stickers. They need route ownership, access state, and stable layout behavior.
- **Window Buttons:** Classic buttons are 20px by 20px; mobile buttons become 28px by 28px. Aqua uses stoplight controls only for window controls.
- **Scrollbars:** Retro scrollbars are part of the shell. They may be stylized, but scrollable areas must remain obvious and reachable.

## 6. Do's and Don'ts

### Do:

- **Do** keep wtfOS user-first, admin-second, and security-visible. The normal user should never be buried under admin clutter.
- **Do** target WCAG 2.2 AA on product and public surfaces: visible focus, keyboard reachability, sufficient contrast, non-color-only state, responsive behavior, reduced motion, and clear errors.
- **Do** use the current appearance variables for chrome: `--wtf-window-color`, `--wtf-active-title`, `--wtf-text-color`, `--wtf-highlight-color`, `--wtf-button-face`, radius variables, padding variables, and shadow variables.
- **Do** preserve purposeful weirdness when it creates ritual, discovery, feedback, social behavior, memory, provenance, or safer choices.
- **Do** make the machine explain itself: what happened, why it matters, what is active, what changed, what failed, and what the user can do next.
- **Do** treat every feature as an organ with shell placement, registry ownership, permissions, event output, user feedback, and observability when it can fail.
- **Do** use exact control sizes where they exist: 32px desktop minimum controls, 44px mobile minimum controls, 20px desktop window buttons, and 28px mobile window buttons.
- **Do** keep wallet prompts plain: provider, account, network, contract, entrypoint, amount, cost, risk, and consequence before trust is requested.

### Don't:

- **Don't** make wtfOS normal, beige, sterile, VC-polished, or dashboard-worshipping.
- **Don't** make it feel like a cloud account wearing a desktop mask.
- **Don't** make it feel like a generic SaaS admin console.
- **Don't** make it feel like a minimalist productivity app.
- **Don't** make it feel like a flattened marketplace.
- **Don't** make it feel like a disconnected website with separate feature pages.
- **Don't** design admin-first UX or let admin tooling visually dominate normal user work.
- **Don't** hide rewards. Reward state must be visible, traceable, and explainable.
- **Don't** allow blind wallet signing. No value-bearing action ships without plain preflight context.
- **Don't** allow silent failures. Errors need visible cause, consequence, and next action.
- **Don't** create orphan apps. Every app needs shell placement, ownership, access policy, and event output.
- **Don't** create dead social spaces. Social surfaces need activity, feedback, or an honest empty state.
- **Don't** use private tools as normal user paths.
- **Don't** create unbounded caches or visual states that imply persistence without provenance.
- **Don't** use unexplained permissions, especially for wallet, admin, privacy, sync, backup, media, and device access.
- **Don't** ship decorative weirdness that emits nothing, teaches nothing, rewards nothing, and connects to nothing.
- **Don't** remove or declaw strange organs merely for cleanliness. Map them, place them, wire them, observe them, or mark them as explicitly rejected.
- **Don't** add nested UI cards, border-left color stripes, gradient text, generic glassmorphism, animated page-load choreography, or marketing hero layouts inside the OS shell.
