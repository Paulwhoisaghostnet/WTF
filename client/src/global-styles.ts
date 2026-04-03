import { createGlobalStyle } from "styled-components";
import { styleReset } from "react95";

export const GlobalStyles = createGlobalStyle`
  ${styleReset}

  body {
    margin: 0;
    font-family: 'ms_sans_serif', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 13px;
    background: #008080;
    overflow: hidden;
    -webkit-font-smoothing: none;
  }

  * {
    box-sizing: border-box;
  }

  #root {
    width: 100vw;
    height: 100vh;
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
`;
