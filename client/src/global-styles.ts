import { createGlobalStyle } from "styled-components";
import { styleReset } from "react95";

export const MOBILE_BP = 768;
export const MOBILE = `@media (max-width: ${MOBILE_BP}px)`;

export const GlobalStyles = createGlobalStyle`
  ${styleReset}

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
