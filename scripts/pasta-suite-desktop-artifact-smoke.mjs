#!/usr/bin/env node

import process from "node:process";

import { runArtifactSmoke } from "./pasta-desktop-artifact-smoke.mjs";

runArtifactSmoke({
  appKey: "pasta-suite",
  executablePath: process.env.PASTA_SUITE_DESKTOP_EXECUTABLE,
  screenshotPath: process.env.PASTA_SUITE_DESKTOP_SCREENSHOT,
  expectedTarget: process.env.PASTA_DESKTOP_EXPECTED_TARGET,
  allowDirtyProvenance: /^(1|true|yes|on)$/i.test(
    String(process.env.PASTA_DESKTOP_ALLOW_DIRTY_PROVENANCE || ""),
  ),
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
