"use strict";

const { contextBridge } = require("electron");

const nativeInfo = {
  native: true,
  suite: true,
  version: process.env.npm_package_version || "",
};

contextBridge.exposeInMainWorld("PASTA_SUITE_DESKTOP", nativeInfo);
contextBridge.exposeInMainWorld("MACARONI_DESKTOP", nativeInfo);
