import { createGlobalStyle } from "styled-components";
import { styleReset } from "react95";

export const MOBILE_BP = 768;
export const MOBILE = `@media (max-width: ${MOBILE_BP}px)`;

export const GlobalStyles = createGlobalStyle`
  ${styleReset}

  body {
    margin: 0;
    font-family: 'ms_sans_serif', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #111;
    background: #008080;
    overflow: hidden;
    -webkit-font-smoothing: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
    color: #111;
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
      outline: 3px solid #005fcc;
      outline-offset: 2px;
    }
  }

  button:not([data-compact-control="true"]),
  [role="button"]:not([data-compact-control="true"]),
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  select,
  textarea {
    min-height: 32px;
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
    background: repeating-conic-gradient(#c0c0c0 0% 25%, #fff 0% 50%) 50% / 2px 2px;
  }

  ::-webkit-scrollbar-thumb {
    background: #c0c0c0;
    border: 1px solid;
    border-color: #fff #808080 #808080 #fff;
  }

  ::-webkit-scrollbar-button {
    display: block;
    width: 16px;
    height: 16px;
    background: #c0c0c0;
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

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-button { display: none; }
  }
`;
