import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App";

// Some wallet SDK dependencies (Beacon/Taquito) assume Node-style global Buffer in the browser.
if (typeof window !== "undefined" && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
