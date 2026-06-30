import { createGlobalStyle } from "styled-components";
import { styleReset } from "react95";

export const MOBILE_BP = 768;
export const MOBILE = `@media (max-width: ${MOBILE_BP}px)`;

export const GlobalStyles = createGlobalStyle`
  ${styleReset}

  @font-face {
    font-family: "wtfOS Soft Sans";
    src: url("/fonts/wtfos-soft-system/Fredoka-latin.woff2") format("woff2");
    font-style: normal;
    font-weight: 300 700;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
      U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
      U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  @font-face {
    font-family: "wtfOS Soft Sans";
    src: url("/fonts/wtfos-soft-system/Fredoka-latin-ext.woff2") format("woff2");
    font-style: normal;
    font-weight: 300 700;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
      U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
      U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
      U+A720-A7FF;
  }

  @font-face {
    font-family: "wtfOS Soft Sans";
    src: url("/fonts/wtfos-soft-system/Fredoka-hebrew.woff2") format("woff2");
    font-style: normal;
    font-weight: 300 700;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC,
      U+FB1D-FB4F;
  }

  @font-face {
    font-family: "wtfOS Global Sans";
    src: url("/fonts/wtfos-soft-system/NotoSans-latin.woff2") format("woff2");
    font-style: normal;
    font-weight: 400 800;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
      U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
      U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  @font-face {
    font-family: "wtfOS Global Sans";
    src: url("/fonts/wtfos-soft-system/NotoSans-latin-ext.woff2") format("woff2");
    font-style: normal;
    font-weight: 400 800;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
      U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
      U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
      U+A720-A7FF;
  }

  @font-face {
    font-family: "wtfOS Global Sans";
    src: url("/fonts/wtfos-soft-system/NotoSans-vietnamese.woff2") format("woff2");
    font-style: normal;
    font-weight: 400 800;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169,
      U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309,
      U+0323, U+0329, U+1EA0-1EF9, U+20AB;
  }

  @font-face {
    font-family: "wtfOS Global Sans";
    src: url("/fonts/wtfos-soft-system/NotoSans-greek.woff2") format("woff2");
    font-style: normal;
    font-weight: 400 800;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0370-0377, U+037A-037F, U+0384-038A, U+038C,
      U+038E-03A1, U+03A3-03FF;
  }

  @font-face {
    font-family: "wtfOS Global Sans";
    src: url("/fonts/wtfos-soft-system/NotoSans-greek-ext.woff2") format("woff2");
    font-style: normal;
    font-weight: 400 800;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+1F00-1FFF;
  }

  @font-face {
    font-family: "wtfOS Global Sans";
    src: url("/fonts/wtfos-soft-system/NotoSans-cyrillic.woff2") format("woff2");
    font-style: normal;
    font-weight: 400 800;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
  }

  @font-face {
    font-family: "wtfOS Global Sans";
    src: url("/fonts/wtfos-soft-system/NotoSans-cyrillic-ext.woff2") format("woff2");
    font-style: normal;
    font-weight: 400 800;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F,
      U+FE2E-FE2F;
  }

  @font-face {
    font-family: "wtfOS Global Sans";
    src: url("/fonts/wtfos-soft-system/NotoSans-devanagari.woff2") format("woff2");
    font-style: normal;
    font-weight: 400 800;
    font-stretch: 100%;
    font-display: swap;
    unicode-range: U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9,
      U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09;
  }

  @font-face {
    font-family: "wtfOS Symbols";
    src: url("/fonts/wtfos-soft-system/NotoSansSymbols2-symbols.woff2") format("woff2");
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    unicode-range: U+20DD-20E0, U+20E2-20E4, U+2150-218F, U+2190, U+2192,
      U+2194-2199, U+21AF, U+21E6-21F0, U+21F3, U+2218-2219, U+2299,
      U+22C4-22C6, U+2300-243F, U+2440-244A, U+2460-24FF, U+25A0-27BF,
      U+2921-2922, U+2981, U+29BF, U+29EB, U+2B00-2BFF, U+4DC0-4DFF,
      U+FFF9-FFFB, U+10140-1018E, U+10190-1019C, U+101A0, U+101D0-101FD,
      U+102E0-102FB, U+10E60-10E7E, U+1D2C0-1D2D3, U+1D2E0-1D37F,
      U+1F000-1F0FF, U+1F100-1F1AD, U+1F1E6-1F1FF, U+1F30D-1F30F,
      U+1F315, U+1F31C, U+1F31E, U+1F320-1F32C, U+1F336, U+1F378,
      U+1F37D, U+1F382, U+1F393-1F39F, U+1F3A7-1F3A8, U+1F3AC-1F3AF,
      U+1F3C2, U+1F3C4-1F3C6, U+1F3CA-1F3CE, U+1F3D4-1F3E0, U+1F3ED,
      U+1F3F1-1F3F3, U+1F3F5-1F3F7, U+1F408, U+1F415, U+1F41F, U+1F426,
      U+1F43F, U+1F441-1F442, U+1F444, U+1F446-1F449, U+1F44C-1F44E,
      U+1F453, U+1F46A, U+1F47D, U+1F4A3, U+1F4B0, U+1F4B3, U+1F4B9,
      U+1F4BB, U+1F4BF, U+1F4C8-1F4CB, U+1F4D6, U+1F4DA, U+1F4DF,
      U+1F4E3-1F4E6, U+1F4EA-1F4ED, U+1F4F7, U+1F4F9-1F4FB, U+1F4FD-1F4FE,
      U+1F503, U+1F507-1F50B, U+1F50D, U+1F512-1F513, U+1F53E-1F54A,
      U+1F54F-1F5FA, U+1F610, U+1F650-1F67F, U+1F687, U+1F68D, U+1F691,
      U+1F694, U+1F698, U+1F6AD, U+1F6B2, U+1F6B9-1F6BA, U+1F6BC,
      U+1F6C6-1F6CF, U+1F6D3-1F6D7, U+1F6E0-1F6EA, U+1F6F0-1F6F3,
      U+1F6F7-1F6FC, U+1F700-1F7FF, U+1F800-1F80B, U+1F810-1F847,
      U+1F850-1F859, U+1F860-1F887, U+1F890-1F8AD, U+1F8B0-1F8BB,
      U+1F8C0-1F8C1, U+1F900-1F90B, U+1F93B, U+1F946, U+1F984, U+1F996,
      U+1F9E9, U+1FA00-1FA6F, U+1FA70-1FA7C, U+1FA80-1FA89, U+1FA8F-1FAC6,
      U+1FACE-1FADC, U+1FADF-1FAE9, U+1FAF0-1FAF8, U+1FB00-1FBFF;
  }

  @font-face {
    font-family: "MEK Mono";
    src: url("/fonts/mek-type/MEK-Mono.woff2") format("woff2");
    font-style: normal;
    font-weight: 400;
    font-display: block;
  }

  @font-face {
    font-family: "MEK Dings";
    src: url("/fonts/mek-type/MEK-Dings.woff2") format("woff2");
    font-style: normal;
    font-weight: 400;
    font-display: swap;
  }

  @font-face {
    font-family: "GROUT Display";
    src: url("/fonts/mek-type/GROUT-Display.woff2") format("woff2");
    font-style: normal;
    font-weight: 400 900;
    font-display: swap;
  }

  body {
    margin: 0;
    font-family: var(--wtf-shell-font, 'ms_sans_serif', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
    font-size: var(--wtf-shell-font-size, 14px);
    line-height: 1.4;
    color: var(--wtf-text-color, #111);
    background: var(--wtf-desktop-color, #008080);
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  ::selection {
    color: var(--wtf-active-title-text, #ffffff);
    background: var(--wtf-highlight-color, #000080);
  }

  button,
  input,
  select,
  textarea {
    font-family: var(--wtf-ui-font, inherit);
    font-size: inherit;
    color: var(--wtf-text-color, #111);
    line-height: 1.3;
  }

  input::placeholder,
  textarea::placeholder {
    color: #595959;
    opacity: 1;
  }

  button,
  [role="button"],
  input,
  select,
  textarea,
    [tabindex]:not([tabindex="-1"]) {
    &:focus-visible {
      outline: 3px solid var(--wtf-highlight-color, #005fcc);
      outline-offset: 2px;
    }
  }

  button {
    letter-spacing: 0;
  }

  [data-wtf-app-surface="true"] {
    min-height: 0;
    min-width: 0;
    color: var(--wtf-app-text, var(--wtf-text-color, #111));
    background: var(--wtf-app-bg, var(--wtf-window-color, #c0c0c0));
    font-family: var(--wtf-app-font, var(--wtf-ui-font, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif));
    font-size: var(--wtf-type-body, 14px);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  [data-wtf-app-scroll="true"] {
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
    overflow-wrap: anywhere;
  }

  [data-wtf-app-scroll="true"] > *,
  [data-wtf-app-surface="true"] :where(article, aside, div, fieldset, form, header, footer, main, nav, section, table, ul, ol, li) {
    min-width: 0;
    max-width: 100%;
  }

  [data-wtf-app-surface="true"] :where(p, li, dd, td, th, label, span) {
    color: inherit;
    overflow-wrap: anywhere;
  }

  [data-wtf-app-surface="true"] :where(small, .wtf-caption, [data-wtf-caption="true"]) {
    color: var(--wtf-app-muted-text, #444);
    font-size: var(--wtf-type-caption, 13px);
    line-height: 1.35;
  }

  [data-wtf-app-surface="true"] :where(button, [role="button"], input, select, textarea) {
    color: var(--wtf-app-text, #111);
    font-size: var(--wtf-type-body, 14px);
    min-height: var(--wtf-control-min-height, 32px);
    line-height: 1.3;
  }

  [data-wtf-app-surface="true"] :where(button, [role="button"], select) :where(span, div) {
    font-size: inherit;
  }

  [data-wtf-app-surface="true"] :where(input[type="checkbox"], input[type="radio"]) {
    min-width: 32px;
    min-height: 32px;
  }

  [data-wtf-app-surface="true"] :where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea) {
    background: var(--wtf-app-control-bg, #ffffff);
    border-color: var(--wtf-app-control-border, #808080);
  }

  [data-wtf-app-surface="true"] :where(input::placeholder, textarea::placeholder) {
    color: var(--wtf-app-muted-text, #444);
    opacity: 1;
  }

  [data-wtf-app-surface="true"] :where(button:disabled, [aria-disabled="true"], input:disabled, select:disabled, textarea:disabled) {
    color: var(--wtf-app-disabled-text, #555);
    background: var(--wtf-app-disabled-bg, #d8d8d8);
    border-color: var(--wtf-app-control-border, #808080);
    cursor: not-allowed;
    opacity: 1;
  }

  [data-wtf-app-surface="true"] :where(a) {
    color: var(--wtf-app-link, var(--wtf-highlight-color, #000080));
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }

  [data-wtf-app-surface="true"] :where(fieldset) {
    color: var(--wtf-app-text, #111);
    background: var(--wtf-app-surface, #f4f4f4);
    border-color: var(--wtf-app-border, #808080);
    padding: max(var(--wtf-space-2, 8px), 0.65rem);
  }

  [data-wtf-app-surface="true"] :where(button, [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])):focus-visible {
    outline-color: var(--wtf-app-focus, var(--wtf-highlight-color, #005fcc));
  }

  [data-wtf-app-surface="true"] :where([data-compact-control="true"]) {
    min-width: 32px !important;
    min-height: 32px !important;
  }

  [data-wtf-app-surface="true"] :where(img, video, canvas, svg) {
    max-width: 100%;
  }

  html[data-wtf-appearance-style="wtf-zine"] [data-wtf-app-surface="true"] {
    text-transform: none;
    background: var(--wtf-app-bg, var(--wtf-window-color, #c0c0c0));
  }

  p {
    margin: 6px 0;
  }

  h1,
  h2,
  h3 {
    font-family: var(--wtf-app-heading-font, var(--wtf-app-font, inherit));
    letter-spacing: 0;
    line-height: 1.15;
  }

  code,
  kbd,
  samp,
  pre {
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace);
  }

  table {
    border-collapse: collapse;
  }

  button:not([data-compact-control="true"]),
  [role="button"]:not([data-compact-control="true"]),
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  select,
  textarea {
    min-height: 32px;
  }

  html[data-wtf-appearance-style] {
    color-scheme: light;
  }

  html[data-wtf-appearance-style] button,
  html[data-wtf-appearance-style] [role="button"],
  html[data-wtf-appearance-style] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  html[data-wtf-appearance-style] select,
  html[data-wtf-appearance-style] textarea {
    border-radius: var(--wtf-control-radius, 0);
    transition: var(--wtf-chrome-transition, none);
  }

  html[data-wtf-appearance-style] button:not([data-compact-control="true"]),
  html[data-wtf-appearance-style] [role="button"]:not([data-compact-control="true"]) {
    border-radius: var(--wtf-button-radius, var(--wtf-control-radius, 0));
  }

  html[data-wtf-appearance-style="wtf-xp"] button:not([data-compact-control="true"]),
  html[data-wtf-appearance-style="wtf-xp"] [role="button"]:not([data-compact-control="true"]) {
    background-image:
      linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.16) 45%, rgba(0,0,0,0.08) 46%, rgba(255,255,255,0.22));
    box-shadow: var(--wtf-button-shadow);
  }

  html[data-wtf-appearance-style="wtf-aqua"] button:not([data-compact-control="true"]),
  html[data-wtf-appearance-style="wtf-aqua"] [role="button"]:not([data-compact-control="true"]) {
    background-image:
      radial-gradient(circle at 50% 8%, rgba(255,255,255,0.95), rgba(255,255,255,0.18) 34%, transparent 46%),
      linear-gradient(180deg, rgba(255,255,255,0.42), rgba(0,0,0,0.05));
    box-shadow: var(--wtf-button-shadow);
  }

  html[data-wtf-appearance-style="wtf-zine"] button:not([data-compact-control="true"]),
  html[data-wtf-appearance-style="wtf-zine"] [role="button"]:not([data-compact-control="true"]) {
    border: 2px solid #000000;
    text-transform: uppercase;
    box-shadow: var(--wtf-button-shadow);
  }

  html[data-wtf-appearance-style="wtf-zine"] button:not([data-compact-control="true"]):active,
  html[data-wtf-appearance-style="wtf-zine"] [role="button"]:not([data-compact-control="true"]):active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 #000000;
  }

  html[data-wtf-appearance-style="wtf-aqua"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  html[data-wtf-appearance-style="wtf-aqua"] select,
  html[data-wtf-appearance-style="wtf-aqua"] textarea {
    box-shadow: inset 0 2px 5px rgba(0,0,0,0.16), 0 1px 0 rgba(255,255,255,0.75);
  }

  html[data-wtf-appearance-style="wtf-zine"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  html[data-wtf-appearance-style="wtf-zine"] select,
  html[data-wtf-appearance-style="wtf-zine"] textarea {
    border: 2px solid #000000;
    box-shadow: 3px 3px 0 #000000;
  }

  * {
    box-sizing: border-box;
  }

  #root {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  ::-webkit-scrollbar {
    width: 16px;
    height: 16px;
  }

  ::-webkit-scrollbar-track {
    background: repeating-conic-gradient(var(--wtf-button-face, #c0c0c0) 0% 25%, #fff 0% 50%) 50% / 2px 2px;
  }

  ::-webkit-scrollbar-thumb {
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--wtf-button-face, #c0c0c0) 72%, #ffffff) 0 25%, var(--wtf-button-face, #c0c0c0) 25% 50%, color-mix(in srgb, var(--wtf-button-face, #c0c0c0) 72%, #ffffff) 50% 75%, var(--wtf-button-face, #c0c0c0) 75% 100%);
    background-size: 6px 6px;
    border: 1px solid;
    border-color: #fff #808080 #808080 #fff;
    border-radius: var(--wtf-control-radius, 0);
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }

  ::-webkit-scrollbar-button {
    display: block;
    width: 16px;
    height: 16px;
    background: var(--wtf-button-face, #c0c0c0);
    border: 1px solid;
    border-color: #fff #808080 #808080 #fff;
  }

  ${MOBILE} {
    body {
      font-size: 14px;
    }

    input[type="text"],
    input[type="search"],
    input[type="email"],
    input[type="password"],
    input[type="number"],
    input[type="url"],
    input[type="tel"],
    input:not([type]),
    textarea,
    select {
      font-size: 16px;
    }

    button:not([data-compact-control="true"]),
    [role="button"]:not([data-compact-control="true"]),
    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
    select,
    textarea {
      min-height: 44px;
    }

    button:not([data-compact-control="true"]),
    [role="button"]:not([data-compact-control="true"]) {
      min-width: 44px;
    }

    [data-wtf-app-surface="true"] :where(input[type="checkbox"], input[type="radio"]) {
      min-width: 44px;
      min-height: 44px;
    }

    [data-wtf-app-surface="true"] :where([data-compact-control="true"]) {
      min-width: 44px !important;
      min-height: 44px !important;
    }

    [data-wtf-app-surface="true"] {
      font-size: max(15px, var(--wtf-type-body, 15px));
    }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-button { display: none; }
  }
`;
