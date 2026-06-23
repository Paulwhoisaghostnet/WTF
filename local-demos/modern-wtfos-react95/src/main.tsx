import React from "react";
import ReactDOM from "react-dom/client";
import isPropValid from "@emotion/is-prop-valid";
import { StyleSheetManager, ThemeProvider } from "styled-components";
import original from "react95/dist/themes/original";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StyleSheetManager
      shouldForwardProp={(prop, target) =>
        typeof target === "string" ? isPropValid(prop) : true
      }
    >
      <ThemeProvider theme={original}>
        <App />
      </ThemeProvider>
    </StyleSheetManager>
  </React.StrictMode>
);
