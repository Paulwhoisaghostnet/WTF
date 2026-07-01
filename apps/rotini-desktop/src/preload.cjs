"use strict";

const { contextBridge } = require("electron");

const nativeInfo = {
  native: true,
  product: "rotini-studio",
  version: process.env.npm_package_version || "",
};

contextBridge.exposeInMainWorld("ROTINI_DESKTOP", nativeInfo);
contextBridge.exposeInMainWorld("PASTA_TOOL_DESKTOP", nativeInfo);
