"use strict";

const { contextBridge } = require("electron");

const nativeInfo = {
  native: true,
  product: "penne-studio",
  version: process.env.npm_package_version || "",
};

contextBridge.exposeInMainWorld("PENNE_DESKTOP", nativeInfo);
contextBridge.exposeInMainWorld("PASTA_TOOL_DESKTOP", nativeInfo);
