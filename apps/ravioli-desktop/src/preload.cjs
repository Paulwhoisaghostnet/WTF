"use strict";

const { contextBridge } = require("electron");

const nativeInfo = {
  native: true,
  product: "ravioli-studio",
  version: process.env.npm_package_version || "",
};

contextBridge.exposeInMainWorld("RAVIOLI_DESKTOP", nativeInfo);
contextBridge.exposeInMainWorld("PASTA_TOOL_DESKTOP", nativeInfo);
