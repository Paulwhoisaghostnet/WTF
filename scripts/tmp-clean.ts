#!/usr/bin/env -S node --import=tsx
import { runTmpCleanup } from "../server/lib/storage/tmp-clean-runner";

const apply = process.argv.includes("--apply");
const ageArg = process.argv.find((arg) => arg.startsWith("--min-age-ms="));
const minAgeMs = ageArg ? Number(ageArg.split("=")[1]) : undefined;

runTmpCleanup({ dryRun: !apply, minAgeMs })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error("[tmp-clean] failed:", error);
    process.exitCode = 1;
  });

