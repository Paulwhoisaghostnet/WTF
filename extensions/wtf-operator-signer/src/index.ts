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
  OperatorSignerOriginationPayload,
} from "../../../shared/operator-signer";
import { appendAuditLine } from "./audit";
import { loadEnv, type SignerEnv } from "./env";
import { PlatformWalletKeyring } from "./keyring";
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

function buildToolkit(env: SignerEnv, signer: InMemorySigner): TezosToolkit {
  const tz = new TezosToolkit(env.WTF_OPERATOR_SIGNER_RPC);
  tz.setProvider({ signer });
  return tz;
}

async function buildSigningContext(
  env: SignerEnv,
  keyring: PlatformWalletKeyring,
  envelope: OperatorSignerEnvelope
): Promise<{ tz: TezosToolkit; signedBy: string }> {
  const { wallet, signer } = await keyring.getSigner(envelope.walletId);
  return {
    tz: buildToolkit(env, signer),
    signedBy: wallet.address,
  };
}

async function handleDisburseWtf(
  env: SignerEnv,
  keyring: PlatformWalletKeyring,
  envelope: Extract<OperatorSignerEnvelope, { intent: "disburse_wtf" }>,
): Promise<string> {
  const { tz, signedBy } = await buildSigningContext(env, keyring, envelope);
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
  keyring: PlatformWalletKeyring,
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
): Promise<string> {
  const { tz, signedBy } = await buildSigningContext(env, keyring, envelope);
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

async function handleOriginateContract(
  env: SignerEnv,
  keyring: PlatformWalletKeyring,
  envelope: Extract<OperatorSignerEnvelope, { intent: "originate_contract" }>,
): Promise<string> {
  const { tz, signedBy } = await buildSigningContext(env, keyring, envelope);
  const payload: OperatorSignerOriginationPayload = envelope.payload;
  const op = await tz.contract.originate({
    code: payload.code as any,
    init: payload.init as any,
    balance: payload.balanceMutez,
    mutez: true,
  } as any);
  await op.confirmation(1);
  const originated = await op.contract();
  await appendAuditLine(env, logger, {
    requestId: envelope.requestId,
    runId: envelope.runId,
    intent: envelope.intent,
    opHash: op.hash,
    contractAddress: originated.address,
    label: payload.label,
    balanceMutez: payload.balanceMutez,
  });
  return JSON.stringify(
    okResponse({
      requestId: envelope.requestId,
      intent: envelope.intent,
      signedBy,
      opHash: op.hash,
      contractAddress: originated.address,
    })
  );
}

async function dispatch(
  env: SignerEnv,
  keyring: PlatformWalletKeyring,
  raw: string
): Promise<string> {
  const parsed = parseEnvelope(raw);
  if (!parsed.ok) return JSON.stringify(parsed.response);

  const policyError = enforceEnvelopePolicy(env, parsed.envelope);
  if (policyError) return JSON.stringify(policyError);

  try {
    switch (parsed.envelope.intent) {
      case "health": {
        const wallets = await keyring.listPublicWallets();
        const selected = await keyring.getSigner(parsed.envelope.walletId).catch(() => null);
        return JSON.stringify(
          okResponse({
            requestId: parsed.envelope.requestId,
            intent: "health",
            signedBy: selected?.wallet.address,
            keyringConfigured: keyring.isConfigured(),
            wallets,
          })
        );
      }
      case "list_platform_wallets":
        return JSON.stringify(
          okResponse({
            requestId: parsed.envelope.requestId,
            intent: parsed.envelope.intent,
            keyringConfigured: keyring.isConfigured(),
            wallets: await keyring.listPublicWallets(),
          })
        );
      case "create_platform_wallet": {
        if (!keyring.canCreateWallets()) {
          return JSON.stringify(
            refuse(
              "platform keyring wallet creation is disabled or locked",
              "KEYRING_DISABLED",
              parsed.envelope.requestId
            )
          );
        }
        const wallet = await keyring.createWallet(parsed.envelope.payload);
        return JSON.stringify(
          okResponse({
            requestId: parsed.envelope.requestId,
            intent: parsed.envelope.intent,
            keyringConfigured: keyring.isConfigured(),
            wallet,
            wallets: await keyring.listPublicWallets(),
          })
        );
      }
      case "disburse_wtf":
        return await handleDisburseWtf(env, keyring, parsed.envelope);
      case "fund_buyback":
      case "withdraw_buyback_xtz":
      case "withdraw_buyback_wtf":
      case "pause_buyback":
      case "unpause_buyback":
      case "custom":
        return await handleContractCall(env, keyring, parsed.envelope);
      case "originate_contract":
        return await handleOriginateContract(env, keyring, parsed.envelope);
    }
  } catch (err) {
    logger.error({ err }, "sign/broadcast failed");
    return JSON.stringify(
      refuse(
        err instanceof Error ? err.message : String(err),
        classifyRuntimeError(err),
        parsed.envelope.requestId
      )
    );
  }
}

function classifyRuntimeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/already exists/i.test(message)) return "WALLET_EXISTS";
  if (/not found/i.test(message)) return "WALLET_NOT_FOUND";
  if (/keyring is locked|not configured/i.test(message)) return "KEYRING_LOCKED";
  return "SIGN_FAILED";
}

async function main(): Promise<void> {
  const env = loadEnv();
  const keyring = new PlatformWalletKeyring(env);
  const defaultWallet = await keyring.getSigner().catch(() => null);
  logger.info(
    {
      pkh: defaultWallet?.wallet.address ?? null,
      rpc: env.WTF_OPERATOR_SIGNER_RPC,
      socket: env.WTF_OPERATOR_SIGNER_SOCKET,
      keyringConfigured: keyring.isConfigured(),
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
      const result = await dispatch(env, keyring, line);
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
