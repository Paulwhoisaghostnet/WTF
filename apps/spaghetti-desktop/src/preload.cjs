"use strict";

const { contextBridge } = require("electron");

const nativeInfo = {
  native: true,
  product: "spaghetti-studio",
  version: process.env.npm_package_version || "",
};

contextBridge.exposeInMainWorld("SPAGHETTI_DESKTOP", nativeInfo);
contextBridge.exposeInMainWorld("PASTA_TOOL_DESKTOP", nativeInfo);
