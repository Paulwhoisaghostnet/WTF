"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invokeCompanionSetup = (action) => ipcRenderer.invoke("macaroni:companion-setup", { action });

const nativeInfo = {
  native: true,
  suite: true,
  version: process.env.npm_package_version || "",
  openCompanionSetupGuide: () => invokeCompanionSetup("open-guide"),
  openCompanionConfigFolder: () => invokeCompanionSetup("open-config-folder"),
};

contextBridge.exposeInMainWorld("PASTA_SUITE_DESKTOP", nativeInfo);
contextBridge.exposeInMainWorld("MACARONI_DESKTOP", nativeInfo);
