import { existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname } from "node:path";
import pino from "pino";
import { TezosToolkit } from "@taquito/taquito";
import { InMemorySigner } from "@taquito/signer";
import type {
  OperatorSignerContractCallPayload,
  OperatorSignerEnvelope,
} from "../../../shared/operator-signer";
import { appendAuditLine } from "./audit";
import { loadEnv, type SignerEnv } from "./env";
import {
  enforceEnvelopePolicy,
  okResponse,
  parseEnvelope,
  refuse,
} from "./policy";

const logger = pino({ name: "wtf-operator-signer" });

type ContractMethodCall = {
  send: (opts?: unknown) => Promise<{ hash: string }>;
};

type ContractMethodFactory = (...args: unknown[]) => ContractMethodCall;

async function buildToolkit(env: SignerEnv): Promise<TezosToolkit> {
  const tz = new TezosToolkit(env.WTF_OPERATOR_SIGNER_RPC);
  tz.setProvider({ signer: new InMemorySigner(env.WTF_OPERATOR_SIGNER_SECRET) });
  return tz;
}

async function handleDisburseWtf(
  env: SignerEnv,
  tz: TezosToolkit,
  envelope: Extract<OperatorSignerEnvelope, { intent: "disburse_wtf" }>,
  signedBy: string
): Promise<string> {
  const fa2 = await tz.contract.at(envelope.payload.tokenContract);
  const txs = envelope.payload.transfers.map((transfer) => ({
    to_: transfer.to,
    token_id: envelope.payload.tokenId,
    amount: transfer.amount,
  }));
  const op = await fa2.methodsObject
    .transfer([{ from_: signedBy, txs }])
    .send();
  await appendAuditLine(env, logger, {
    requestId: envelope.requestId,
    runId: envelope.runId,
    intent: envelope.intent,
    opHash: op.hash,
    recipients: envelope.payload.transfers.length,
    tokenContract: envelope.payload.tokenContract,
    tokenId: envelope.payload.tokenId,
  });
  return JSON.stringify(
    okResponse({
      requestId: envelope.requestId,
      intent: envelope.intent,
      signedBy,
      opHash: op.hash,
    })
  );
}

async function handleContractCall(
  env: SignerEnv,
  tz: TezosToolkit,
  envelope: Extract<
    OperatorSignerEnvelope,
    {
      intent:
        | "fund_buyback"
        | "withdraw_buyback_xtz"
        | "withdraw_buyback_wtf"
        | "pause_buyback"
        | "unpause_buyback"
        | "custom";
    }
  >,
  signedBy: string
): Promise<string> {
  const payload: OperatorSignerContractCallPayload = envelope.payload;
  const contract = await tz.contract.at(payload.contract);
  const method = contract.methodsObject[payload.entrypoint];
  if (typeof method !== "function") {
    return JSON.stringify(
      refuse(
        `unknown entrypoint ${payload.entrypoint}`,
        "BAD_EP",
        envelope.requestId
      )
    );
  }
  const operation = buildMethodCall(method as ContractMethodFactory, payload.args);
  const op = await operation.send({
    amount: payload.mutez,
    mutez: true,
  });
  await appendAuditLine(env, logger, {
    requestId: envelope.requestId,
    runId: envelope.runId,
    intent: envelope.intent,
    opHash: op.hash,
    contract: payload.contract,
    entrypoint: payload.entrypoint,
    mutez: payload.mutez,
  });
  return JSON.stringify(
    okResponse({
      requestId: envelope.requestId,
      intent: envelope.intent,
      signedBy,
      opHash: op.hash,
    })
  );
}

async function dispatch(
  env: SignerEnv,
  tz: TezosToolkit,
  signedBy: string,
  raw: string
): Promise<string> {
  const parsed = parseEnvelope(raw);
  if (!parsed.ok) return JSON.stringify(parsed.response);

  const policyError = enforceEnvelopePolicy(env, parsed.envelope);
  if (policyError) return JSON.stringify(policyError);

  try {
    switch (parsed.envelope.intent) {
      case "health":
        return JSON.stringify(
          okResponse({
            requestId: parsed.envelope.requestId,
            intent: "health",
            signedBy,
          })
        );
      case "disburse_wtf":
        return await handleDisburseWtf(env, tz, parsed.envelope, signedBy);
      case "fund_buyback":
      case "withdraw_buyback_xtz":
      case "withdraw_buyback_wtf":
      case "pause_buyback":
      case "unpause_buyback":
      case "custom":
        return await handleContractCall(env, tz, parsed.envelope, signedBy);
    }
  } catch (err) {
    logger.error({ err }, "sign/broadcast failed");
    return JSON.stringify(
      refuse(
        err instanceof Error ? err.message : String(err),
        "SIGN_FAILED",
        parsed.envelope.requestId
      )
    );
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const tz = await buildToolkit(env);
  const signedBy = await tz.signer.publicKeyHash();
  logger.info(
    {
      pkh: signedBy,
      rpc: env.WTF_OPERATOR_SIGNER_RPC,
      socket: env.WTF_OPERATOR_SIGNER_SOCKET,
    },
    "wtf-operator-signer online"
  );

  if (existsSync(env.WTF_OPERATOR_SIGNER_SOCKET)) {
    await unlink(env.WTF_OPERATOR_SIGNER_SOCKET);
  }
  await mkdir(dirname(env.WTF_OPERATOR_SIGNER_SOCKET), { recursive: true });

  const server = createServer((socket) => {
    let buffer = "";
    socket.on("data", async (chunk) => {
      buffer += chunk.toString("utf8");
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) return;
      const result = await dispatch(env, tz, signedBy, line);
      socket.write(result + "\n");
      socket.end();
    });
    socket.on("error", (err) => logger.warn({ err }, "socket error"));
  });

  server.listen(env.WTF_OPERATOR_SIGNER_SOCKET, () => {
    logger.info("listening");
  });

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      logger.info({ sig }, "shutting down");
      server.close(() => process.exit(0));
    });
  }
}

function buildMethodCall(
  method: ContractMethodFactory,
  args: unknown
): ContractMethodCall {
  if (Array.isArray(args)) return method(...args);
  if (args == null) return method();
  return method(args);
}

main().catch((err) => {
  logger.error({ err }, "fatal");
  process.exit(1);
});
