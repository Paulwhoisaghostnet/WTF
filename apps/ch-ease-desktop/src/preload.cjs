"use strict";

const { contextBridge } = require("electron");

const nativeInfo = {
  native: true,
  product: "ch-ease-studio",
  version: process.env.npm_package_version || "",
};

contextBridge.exposeInMainWorld("CH_EASE_DESKTOP", nativeInfo);
contextBridge.exposeInMainWorld("PASTA_TOOL_DESKTOP", nativeInfo);
