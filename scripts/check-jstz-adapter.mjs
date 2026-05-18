#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function parseArgv(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { error: "JSTZ_COUNTER_PROOF_COMMAND must be a non-empty JSON argv array." };
    }
    if (!parsed.every((entry) => typeof entry === "string" && entry.length > 0)) {
      return { error: "JSTZ_COUNTER_PROOF_COMMAND entries must be non-empty strings." };
    }
    return { argv: parsed };
  } catch (error) {
    return { error: `JSTZ_COUNTER_PROOF_COMMAND is not valid JSON: ${error.message}` };
  }
}

function commandExists(command) {
  const result = spawnSync("which", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

export function checkJstzAdapter(env = process.env) {
  const required = truthy(env.JSTZ_ADAPTER_REQUIRED);
  const enabled = truthy(env.KILN_JSTZ_ENABLED);
  const executable = env.JSTZ_EXECUTABLE || "jstz";
  const missing = [];
  const notes = [];

  if (!enabled) {
    if (required) missing.push("KILN_JSTZ_ENABLED");
    return {
      status: required ? "blocked_required" : "planned_disabled",
      canClaimAdapter: false,
      executable,
      missing,
      notes: ["jstz remains disabled until a real local/configurable adapter proof runs."],
    };
  }

  if (!commandExists(executable)) {
    missing.push("jstz_executable");
  }

  const parsed = parseArgv(env.JSTZ_COUNTER_PROOF_COMMAND);
  if (!parsed) {
    missing.push("JSTZ_COUNTER_PROOF_COMMAND");
  } else if (parsed.error) {
    missing.push("JSTZ_COUNTER_PROOF_COMMAND");
    notes.push(parsed.error);
  }

  if (missing.length > 0 || !parsed?.argv) {
    return {
      status: required ? "blocked_required" : "blocked",
      canClaimAdapter: false,
      executable,
      missing,
      notes,
    };
  }

  const [cmd, ...args] = parsed.argv;
  const proof = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  if (proof.status !== 0) {
    return {
      status: required ? "blocked_required" : "proof_failed",
      canClaimAdapter: false,
      executable,
      missing: ["jstz_counter_proof"],
      proof: {
        command: parsed.argv,
        status: proof.status,
        stdout: proof.stdout?.trim() || "",
        stderr: proof.stderr?.trim() || "",
      },
      notes,
    };
  }

  return {
    status: "verified",
    canClaimAdapter: true,
    executable,
    missing: [],
    proof: {
      command: parsed.argv,
      status: proof.status,
      stdout: proof.stdout?.trim() || "",
      stderr: proof.stderr?.trim() || "",
    },
    notes,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = checkJstzAdapter();
  console.log(JSON.stringify(result, null, 2));
  if (!result.canClaimAdapter && result.status === "blocked_required") {
    process.exit(2);
  }
  if (result.status === "proof_failed") {
    process.exit(1);
  }
}
