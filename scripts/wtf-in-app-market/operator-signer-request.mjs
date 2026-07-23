#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createConnection } from "node:net";

const [intent, walletId, firstPathOrContract, secondPathOrEntrypoint, argsPath] =
  process.argv.slice(2);
const auth = process.env.WTF_OPERATOR_SIGNER_AUTH_TOKEN?.trim();
const socketPath =
  process.env.WTF_OPERATOR_SIGNER_SOCKET?.trim() ||
  "/run/wtf/operator-signer.sock";
const callMutezRaw =
  process.env.WTF_OPERATOR_SIGNER_CALL_MUTEZ?.trim() || "0";
if (!/^\d+$/.test(callMutezRaw)) {
  throw new Error("WTF_OPERATOR_SIGNER_CALL_MUTEZ must be a non-negative integer");
}
const callMutez = Number(callMutezRaw);
if (!Number.isSafeInteger(callMutez)) {
  throw new Error("WTF_OPERATOR_SIGNER_CALL_MUTEZ exceeds the safe integer range");
}

if (!["originate_contract", "custom"].includes(intent)) {
  throw new Error("Supported intents: originate_contract, custom");
}
if (!walletId || !firstPathOrContract || !secondPathOrEntrypoint) {
  throw new Error(
    "Usage: operator-signer-request.mjs originate_contract <wallet-id> <contract.json> <storage.json>\n" +
      "   or: operator-signer-request.mjs custom <wallet-id> <contract> <entrypoint> <args.json>",
  );
}
if (intent === "custom" && !argsPath) {
  throw new Error("A JSON args path is required for custom calls");
}
if (!auth) {
  throw new Error("WTF_OPERATOR_SIGNER_AUTH_TOKEN is required");
}

const payload =
  intent === "originate_contract"
    ? {
        code: JSON.parse(readFileSync(firstPathOrContract, "utf8")),
        init: JSON.parse(readFileSync(secondPathOrEntrypoint, "utf8")),
        balanceMutez: 0,
        label:
          process.env.WTF_OPERATOR_SIGNER_ORIGINATION_LABEL?.trim() ||
          "wtf-in-app-redemption-escrow-v2",
      }
    : {
        contract: firstPathOrContract,
        entrypoint: secondPathOrEntrypoint,
        args: JSON.parse(readFileSync(argsPath, "utf8")),
        mutez: callMutez,
      };

const envelope = {
  version: 1,
  auth,
  requestId: `wtf-in-app-market-${Date.now()}`,
  runId: process.env.WTF_OPERATOR_SIGNER_RUN_ID?.trim() || undefined,
  walletId,
  intent,
  payload,
};

const response = await new Promise((resolve, reject) => {
  let output = "";
  const socket = createConnection({ path: socketPath });
  socket.setEncoding("utf8");
  socket.setTimeout(120_000, () => {
    socket.destroy(new Error("operator signer response timed out"));
  });
  socket.on("connect", () => socket.write(`${JSON.stringify(envelope)}\n`));
  socket.on("data", (chunk) => {
    output += chunk;
  });
  socket.on("end", () => resolve(output.trim()));
  socket.on("error", reject);
});

const parsed = JSON.parse(response);
if (!parsed.ok) {
  throw new Error(`${parsed.code}: ${parsed.error}`);
}
process.stdout.write(`${JSON.stringify(parsed)}\n`);
