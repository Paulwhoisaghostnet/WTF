"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invokeCompanionSetup = (action) => ipcRenderer.invoke("macaroni:companion-setup", { action });

contextBridge.exposeInMainWorld("MACARONI_DESKTOP", {
  native: true,
  version: process.env.npm_package_version || "",
  openCompanionSetupGuide: () => invokeCompanionSetup("open-guide"),
  openCompanionConfigFolder: () => invokeCompanionSetup("open-config-folder"),
});
