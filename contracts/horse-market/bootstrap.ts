import { Buffer } from "buffer";

// Match the WTF OS wallet bootstrap before loading Octez Connect or Taquito.
const browserGlobal = globalThis as any;
browserGlobal.global ||= browserGlobal;
browserGlobal.Buffer ||= Buffer;
browserGlobal.process ||= {};
browserGlobal.process.env ||= {};
browserGlobal.process.version ||= "v20.0.0";
browserGlobal.process.versions ||= { node: "20.0.0" };
browserGlobal.process.browser ??= true;
browserGlobal.process.nextTick ||= (cb: (...args: any[]) => void, ...args: any[]) =>
  queueMicrotask(() => cb(...args));

void import("./originate");
