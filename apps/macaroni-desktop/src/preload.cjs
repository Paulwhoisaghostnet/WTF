"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("MACARONI_DESKTOP", {
  native: true,
  version: process.env.npm_package_version || "",
});
