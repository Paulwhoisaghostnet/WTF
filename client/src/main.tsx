import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installClientSystemLogging } from "./lib/system-log";
import { installCsrfFetchBoundary } from "./lib/api";

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

installCsrfFetchBoundary();
installClientSystemLogging();

const chunkRecoveryKey = "wtf:chunk-reload-at";
const chunkFailurePattern =
  /Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload/i;

function reloadOnceForFreshAssets(reason: unknown) {
  if (typeof window === "undefined") return;
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  if (!chunkFailurePattern.test(message)) return;

  const now = Date.now();
  const lastReload = Number(window.sessionStorage.getItem(chunkRecoveryKey) || 0);
  if (now - lastReload < 30_000) return;

  window.sessionStorage.setItem(chunkRecoveryKey, String(now));
  window.location.reload();
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForFreshAssets((event as Event & { payload?: unknown }).payload);
});

window.addEventListener("unhandledrejection", (event) => {
  if (chunkFailurePattern.test(String(event.reason?.message ?? event.reason ?? ""))) {
    event.preventDefault();
    reloadOnceForFreshAssets(event.reason);
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
