import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App";

// Some wallet SDK dependencies (Beacon/Taquito) assume Node-style globals in browsers.
const browserGlobal = globalThis as any;
if (!browserGlobal.global) {
  browserGlobal.global = browserGlobal;
}
if (!browserGlobal.Buffer) {
  browserGlobal.Buffer = Buffer;
}
if (!browserGlobal.process) {
  browserGlobal.process = {};
}
if (!browserGlobal.process.env) {
  browserGlobal.process.env = {};
}
if (!browserGlobal.process.version) {
  browserGlobal.process.version = "v20.0.0";
}
if (!browserGlobal.process.versions) {
  browserGlobal.process.versions = { node: "20.0.0" };
}
if (typeof browserGlobal.process.browser === "undefined") {
  browserGlobal.process.browser = true;
}
if (!browserGlobal.process.nextTick) {
  browserGlobal.process.nextTick = (cb: (...args: any[]) => void, ...args: any[]) =>
    queueMicrotask(() => cb(...args));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
