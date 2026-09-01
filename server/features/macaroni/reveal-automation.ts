import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { InMemorySigner } from "@taquito/signer";
import { TezosToolkit } from "@taquito/taquito";
import { and, eq, lte } from "drizzle-orm";
import { db } from "../../db";
import { macaroniRevealJobs } from "@shared/schema";
import {
  createSecureAllocation,
  type MacaroniRevealManifestSlot,
} from "./secure-allocation";

export type MacaroniRevealNetwork = "mainnet" | "shadownet";
export type MacaroniRevealMode = "instant" | "delayed";

export type MacaroniRevealManifestToken = {
  tokenId: number;
  metadataUri: string;
  nonce: string;
  commitment: string;
};

type MacaroniRevealManifest = {
  tokens: MacaroniRevealManifestToken[];
  slots: MacaroniRevealManifestSlot[];
};

const RPC: Record<MacaroniRevealNetwork, readonly [string, string]> = {
  mainnet: ["https://tezos-mainnet.octez.io/", "https://tcinfra.net/rpc/tezos/mainnet"],
  shadownet: ["https://tezos-shadownet.octez.io/", "https://tcinfra.net/rpc/tezos/shadownet"],
};
const ENCRYPTION_VERSION = "v1";
const REVEAL_BATCH_SIZE = 40;
const activeContracts = new Set<string>();

function operatorSecret(network: MacaroniRevealNetwork): string {
  const name = network === "mainnet"
    ? "MACARONI_REVEAL_OPERATOR_MAINNET_SECRET_KEY"
    : "MACARONI_REVEAL_OPERATOR_SHADOWNET_SECRET_KEY";
  return String(process.env[name] || "").trim();
}

function encryptionKey(): Buffer {
  const material = String(process.env.MACARONI_REVEAL_ENCRYPTION_KEY || "").trim();
  if (!material) throw new Error("Macaroni reveal encryption is not configured");
  return createHash("sha256").update(material).digest();
}

export function macaroniRevealPollIntervalMs(): number | null {
  const value = Number(process.env.MACARONI_REVEAL_RECONCILE_INTERVAL_MS);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function encryptManifest(manifest: MacaroniRevealManifest): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ version: 2, ...manifest }), "utf8"),
    cipher.final(),
  ]);
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

function decryptManifest(payload: string): MacaroniRevealManifest {
  const [version, ivText, encryptedText, tagText, extra] = String(payload || "").split(".");
  if (version !== ENCRYPTION_VERSION || !ivText || !encryptedText || !tagText || extra) {
    throw new Error("Invalid Macaroni reveal manifest");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  const decoded = JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8")) as {
    version?: number;
    tokens?: MacaroniRevealManifestToken[];
    slots?: MacaroniRevealManifestSlot[];
  };
  if ((decoded.version !== 1 && decoded.version !== 2) || !Array.isArray(decoded.tokens)) {
    throw new Error("Invalid Macaroni reveal manifest body");
  }
  if (decoded.version === 2 && !Array.isArray(decoded.slots)) {
    throw new Error("Invalid Macaroni secure allocation manifest");
  }
  return {
    tokens: decoded.tokens,
    slots: decoded.version === 2 ? decoded.slots! : [],
  };
}

async function operatorSigner(network: MacaroniRevealNetwork): Promise<InMemorySigner> {
  const secret = operatorSecret(network);
  if (!secret) throw new Error(`Macaroni ${network} reveal operator is not configured`);
  return new InMemorySigner(secret);
}

export async function getMacaroniRevealOperator(network: MacaroniRevealNetwork): Promise<{
  enabled: boolean;
  address: string | null;
}> {
  if (!operatorSecret(network) || !process.env.MACARONI_REVEAL_ENCRYPTION_KEY || !macaroniRevealPollIntervalMs()) {
    return { enabled: false, address: null };
  }
  const signer = await operatorSigner(network);
  return { enabled: true, address: await signer.publicKeyHash() };
}

function normalizedHex(value: unknown): string {
  return String(value || "").replace(/^0x/i, "").toLowerCase();
}

function manifestsMatch(left: MacaroniRevealManifestToken[], right: MacaroniRevealManifestToken[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((token, index) => {
    const other = right[index];
    return token.tokenId === other?.tokenId
      && token.metadataUri === other.metadataUri
      && normalizedHex(token.nonce) === normalizedHex(other.nonce)
      && normalizedHex(token.commitment) === normalizedHex(other.commitment);
  });
}

function timestampMs(value: unknown): number | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function contractStorage(network: MacaroniRevealNetwork, contractAddress: string, signer?: InMemorySigner) {
  let lastError: unknown;
  for (const rpc of RPC[network]) {
    try {
      const tezos = new TezosToolkit(rpc);
      if (signer) tezos.setProvider({ signer });
      const contract = await tezos.contract.at(contractAddress);
      const storage = await contract.storage<any>();
      return { contract, storage };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not read ${network} V3 contract`);
}

export async function registerMacaroniRevealAutomation(input: {
  ownerUserId: number | null;
  network: MacaroniRevealNetwork;
  contract: string;
  administrator: string;
  mode: MacaroniRevealMode;
  revealDelaySeconds: number;
  tokens: MacaroniRevealManifestToken[];
}) {
  const operator = await getMacaroniRevealOperator(input.network);
  if (!operator.enabled || !operator.address) {
    throw new Error(`Automatic Macaroni reveal is not configured for ${input.network}`);
  }
  const { storage } = await contractStorage(input.network, input.contract);
  if (String(storage.administrator) !== input.administrator) {
    throw new Error("Connected creator is not the V3 contract administrator");
  }
  if (String(storage.reveal_operator) !== operator.address) {
    throw new Error("V3 contract does not authorize the configured automatic revealer");
  }
  if (Boolean(storage.delayed_reveal) !== (input.mode === "delayed")) {
    throw new Error("V3 contract reveal mode does not match the Studio draft");
  }
  if (Number(storage.reveal_delay) !== input.revealDelaySeconds) {
    throw new Error("V3 contract reveal delay does not match the Studio draft");
  }
  if (Number(storage.token_count) !== input.tokens.length) {
    throw new Error("V3 reveal manifest does not match the synced token inventory");
  }
  const tokens = [...input.tokens].sort((left, right) => left.tokenId - right.tokenId);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.tokenId !== index) {
      throw new Error("V3 reveal manifest token ids must be complete and sequential");
    }
    const expected = createHash("sha256")
      .update(Buffer.concat([
        Buffer.from(token.metadataUri, "utf8"),
        Buffer.from(normalizedHex(token.nonce), "hex"),
      ]))
      .digest("hex");
    if (expected !== normalizedHex(token.commitment)) {
      throw new Error(`V3 reveal secret does not match its commitment for token ${token.tokenId}`);
    }
    const committed = normalizedHex(await storage.token_commitments.get(token.tokenId));
    if (!committed || committed !== normalizedHex(token.commitment)) {
      throw new Error(`V3 reveal manifest commitment mismatch for token ${token.tokenId}`);
    }
  }

  const existing = await db
    .select({
      id: macaroniRevealJobs.id,
      ownerUserId: macaroniRevealJobs.ownerUserId,
      encryptedManifest: macaroniRevealJobs.encryptedManifest,
    })
    .from(macaroniRevealJobs)
    .where(and(
      eq(macaroniRevealJobs.network, input.network),
      eq(macaroniRevealJobs.contract, input.contract)
    ))
    .limit(1);
  if (existing[0] && existing[0].ownerUserId != null && input.ownerUserId != null && existing[0].ownerUserId !== input.ownerUserId) {
    throw new Error("This V3 contract already belongs to another automatic reveal registration");
  }

  const secureAllocation = storage.slot_commitments != null
    && storage.inventory_finalized != null
    && storage.claims != null;
  let slots: MacaroniRevealManifestSlot[] = [];
  if (existing[0]) {
    const previous = decryptManifest(existing[0].encryptedManifest);
    if (!manifestsMatch(previous.tokens, tokens)) {
      throw new Error("This V3 contract is already registered with a different private reveal manifest");
    }
    slots = previous.slots;
  }
  if (secureAllocation && slots.length === 0) {
    if (Number(storage.slot_commitment_count || 0) !== 0) {
      throw new Error("The on-chain secure allocation cannot be recovered from this reveal registration");
    }
    const allocationTokens = [];
    for (const token of tokens) {
      allocationTokens.push({
        tokenId: token.tokenId,
        quantity: Number(await storage.token_supply.get(token.tokenId)),
        metadataCommitment: token.commitment,
      });
    }
    slots = createSecureAllocation(allocationTokens, Number(storage.supply));
  }
  if (secureAllocation && slots.length !== Number(storage.supply)) {
    throw new Error("V3 secure allocation does not match the on-chain edition supply");
  }

  const values = {
    ownerUserId: input.ownerUserId,
    network: input.network,
    contract: input.contract,
    administrator: input.administrator,
    revealOperator: operator.address,
    mode: input.mode,
    revealDelaySeconds: input.revealDelaySeconds,
    encryptedManifest: encryptManifest({ tokens, slots }),
    status: "active" as const,
    nextAttemptAt: new Date(),
    lastError: null,
    completedAt: null,
    updatedAt: new Date(),
  };
  if (existing[0]) {
    const [updated] = await db
      .update(macaroniRevealJobs)
      .set(values)
      .where(eq(macaroniRevealJobs.id, existing[0].id))
      .returning();
    return {
      job: updated,
      slotCommitments: slots.map(({ slotId, commitment }) => ({ slotId, commitment })),
    };
  }
  const [created] = await db.insert(macaroniRevealJobs).values(values).returning();
  return {
    job: created,
    slotCommitments: slots.map(({ slotId, commitment }) => ({ slotId, commitment })),
  };
}

async function processRevealJob(job: typeof macaroniRevealJobs.$inferSelect): Promise<{
  revealed: number;
  completed: boolean;
}> {
  const key = `${job.network}:${job.contract}`;
  if (activeContracts.has(key)) return { revealed: 0, completed: false };
  activeContracts.add(key);
  try {
    const signer = await operatorSigner(job.network);
    const operatorAddress = await signer.publicKeyHash();
    if (operatorAddress !== job.revealOperator) throw new Error("Configured reveal signer no longer matches this V3 contract");
    let { contract, storage } = await contractStorage(job.network, job.contract, signer);
    if (String(storage.reveal_operator) !== operatorAddress) throw new Error("V3 reveal operator authorization changed on-chain");

    const intervalMs = macaroniRevealPollIntervalMs();
    if (!intervalMs) throw new Error("Macaroni reveal reconciliation interval is not configured");
    const manifest = decryptManifest(job.encryptedManifest);
    const secureAllocation = storage.slot_commitments != null
      && storage.inventory_finalized != null
      && storage.claims != null;
    let lastOperationHash: string | null = job.lastOperationHash;
    if (secureAllocation) {
      if (!Boolean(storage.inventory_finalized)) {
        throw new Error("V3 secure inventory has not been finalized");
      }
      if (manifest.slots.length !== Number(storage.supply)) {
        throw new Error("V3 secure allocation manifest is incomplete");
      }
      const settledCount = Number(storage.settled_count || 0);
      const claimCount = Number(storage.claim_count || 0);
      if (!Number.isSafeInteger(settledCount) || !Number.isSafeInteger(claimCount)
        || settledCount < 0 || claimCount < settledCount || claimCount > manifest.slots.length) {
        throw new Error("V3 claim counters are invalid");
      }
      const settlements = manifest.slots.slice(settledCount, claimCount).map((slot, offset) => {
        const claimId = settledCount + offset;
        if (slot.slotId !== claimId) throw new Error(`V3 secure allocation slot ${claimId} is invalid`);
        return {
          claim_id: claimId,
          token_id: slot.tokenId,
          slot_nonce: slot.nonce,
        };
      });
      for (let index = 0; index < settlements.length; index += REVEAL_BATCH_SIZE) {
        const batch = settlements.slice(index, index + REVEAL_BATCH_SIZE);
        const operation = await contract.methodsObject.settle_mints(batch).send();
        await operation.confirmation(1);
        lastOperationHash = operation.hash;
      }
      if (settlements.length) {
        ({ contract, storage } = await contractStorage(job.network, job.contract, signer));
      }
    }
    if (job.mode === "delayed") {
      const pendingSince = timestampMs(storage.unrevealed_since);
      if (pendingSince != null) {
        const unlockAt = pendingSince + job.revealDelaySeconds * 1000;
        if (Date.now() < unlockAt) {
          await db.update(macaroniRevealJobs).set({
            nextAttemptAt: new Date(unlockAt),
            lastError: null,
            updatedAt: new Date(),
          }).where(eq(macaroniRevealJobs.id, job.id));
          return { revealed: 0, completed: false };
        }
      }
    }

    const pending: Array<{ token_id: number; metadata_uri: string; nonce: string }> = [];
    let revealedCount = 0;
    for (const token of manifest.tokens) {
      const revealed = await storage.revealed_tokens.get(token.tokenId);
      if (revealed != null) {
        revealedCount += 1;
        continue;
      }
      const minted = Number(await storage.token_minted.get(token.tokenId) || 0);
      if (minted <= 0) continue;
      const committed = normalizedHex(await storage.token_commitments.get(token.tokenId));
      if (committed !== normalizedHex(token.commitment)) {
        throw new Error(`On-chain commitment changed for token ${token.tokenId}`);
      }
      pending.push({
        token_id: token.tokenId,
        metadata_uri: Buffer.from(token.metadataUri, "utf8").toString("hex"),
        nonce: token.nonce,
      });
    }

    for (let index = 0; index < pending.length; index += REVEAL_BATCH_SIZE) {
      const batch = pending.slice(index, index + REVEAL_BATCH_SIZE);
      const operation = await contract.methodsObject.reveal_tokens_v3(batch).send();
      await operation.confirmation(1);
      lastOperationHash = operation.hash;
      revealedCount += batch.length;
    }
    const completed = revealedCount === manifest.tokens.length
      && (!secureAllocation || Number(storage.settled_count || 0) === Number(storage.supply));
    await db.update(macaroniRevealJobs).set({
      status: completed ? "completed" : "active",
      nextAttemptAt: new Date(Date.now() + intervalMs),
      lastOperationHash,
      lastError: null,
      completedAt: completed ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(macaroniRevealJobs.id, job.id));
    return { revealed: pending.length, completed };
  } catch (error) {
    const intervalMs = macaroniRevealPollIntervalMs();
    await db.update(macaroniRevealJobs).set({
      nextAttemptAt: new Date(Date.now() + (intervalMs || 1)),
      lastError: error instanceof Error ? error.message : String(error),
      updatedAt: new Date(),
    }).where(eq(macaroniRevealJobs.id, job.id));
    throw error;
  } finally {
    activeContracts.delete(key);
  }
}

export async function runMacaroniRevealAutomation() {
  const due = await db
    .select()
    .from(macaroniRevealJobs)
    .where(and(
      eq(macaroniRevealJobs.status, "active"),
      lte(macaroniRevealJobs.nextAttemptAt, new Date())
    ));
  let revealed = 0;
  let completed = 0;
  let failed = 0;
  for (const job of due) {
    try {
      const result = await processRevealJob(job);
      revealed += result.revealed;
      if (result.completed) completed += 1;
    } catch (error) {
      failed += 1;
      console.error(`[macaroni-reveal] ${job.network}:${job.contract} failed`, error);
    }
  }
  return {
    itemsIn: due.length,
    itemsOut: revealed,
    cursorAfter: { completed, failed },
  };
}

export async function requestMacaroniReveal(
  network: MacaroniRevealNetwork,
  contract: string
): Promise<{ registered: boolean; revealed: number; completed: boolean }> {
  const [job] = await db
    .select()
    .from(macaroniRevealJobs)
    .where(and(
      eq(macaroniRevealJobs.network, network),
      eq(macaroniRevealJobs.contract, contract),
      eq(macaroniRevealJobs.status, "active")
    ))
    .limit(1);
  if (!job) return { registered: false, revealed: 0, completed: false };
  const result = await processRevealJob(job);
  return { registered: true, ...result };
}
