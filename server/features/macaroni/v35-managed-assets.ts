import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, openAsBlob } from "node:fs";
import { appendFile, mkdir, mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, asc, eq } from "drizzle-orm";
import { PinataSDK } from "pinata";
import { DEFAULT_IPFS_GATEWAYS, buildIpfsGatewayCandidates } from "@shared/ipfs-gateways";
import { db } from "../../db";
import {
  macaroniV35Drops,
  macaroniV35PrivateAssets,
  macaroniV35SetupSteps,
} from "@shared/schema";
import {
  deleteObject,
  downloadObjectToFile,
  putObjectFromFile,
} from "../../lib/storage/object-storage";
import {
  stageMacaroniPrivateToken,
  verifyMacaroniPrivateCar,
} from "./v35-private-staging";
import { macaroniV35MetadataCommitment, sha256Hex } from "./v35-crypto";
import { hashMacaroniV35Payload } from "./v35-types";
import { managedMacaroniV35CarPublisherConfig } from "./v35-runtime-config";
import { macaroniV35ProcessingRoot } from "./v35-temp-storage";

const ENCRYPTED_FILE_MAGIC = Buffer.from("MACV35E1", "ascii");
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

function managedEncryptionKeyring() {
  const serialized = String(process.env.MACARONI_V35_ASSET_KEYRING_JSON || "").trim();
  const configuredActive = String(process.env.MACARONI_V35_ASSET_ACTIVE_KEY_VERSION || "").trim();
  let activeVersion = configuredActive;
  let values: Record<string, unknown>;
  if (serialized || configuredActive) {
    if (!serialized || !configuredActive) throw new Error("Managed V3.5 asset keyring configuration is incomplete");
    try {
      values = JSON.parse(serialized) as Record<string, unknown>;
    } catch {
      throw new Error("Managed V3.5 asset keyring JSON is invalid");
    }
  } else {
    const legacyKey = String(process.env.MACARONI_V35_ASSET_ENCRYPTION_KEY || "");
    const legacyVersion = String(process.env.MACARONI_V35_ASSET_KEY_VERSION || "").trim();
    activeVersion = legacyVersion;
    values = legacyKey && legacyVersion ? { [legacyVersion]: legacyKey } : {};
  }
  if (!activeVersion || !values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Managed V3.5 private-asset encryption is not configured");
  }
  const keys = new Map<string, Buffer>();
  for (const [version, material] of Object.entries(values)) {
    if (!version.trim() || typeof material !== "string" || material.length < 32) {
      throw new Error("Every managed V3.5 asset key version needs at least 32 characters of key material");
    }
    keys.set(version, createHash("sha256").update(material).digest());
  }
  if (!keys.has(activeVersion)) throw new Error("Managed V3.5 active asset key version is absent from its keyring");
  return { activeVersion, keys };
}

function managedEncryptionMaterial(keyVersion?: string) {
  const keyring = managedEncryptionKeyring();
  const resolvedVersion = keyVersion || keyring.activeVersion;
  const key = keyring.keys.get(resolvedVersion);
  if (!key) throw new Error(`Managed V3.5 asset key version ${resolvedVersion} is unavailable`);
  return { key, keyVersion: resolvedVersion };
}

export function managedMacaroniV35AssetKeyVersion() {
  return managedEncryptionKeyring().activeVersion;
}

async function sha256Path(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export function encryptMacaroniV35PrivatePayload(value: unknown) {
  const { key, keyVersion } = managedEncryptionMaterial();
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [
    "v1",
    keyVersion,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function decryptMacaroniV35PrivatePayload<T>(encrypted: string): T {
  const [version, storedKeyVersion, iv, ciphertext, tag, extra] = encrypted.split(".");
  if (version !== "v1" || !storedKeyVersion || !iv || !ciphertext || !tag || extra) {
    throw new Error("Private asset payload envelope is invalid");
  }
  const { key } = managedEncryptionMaterial(storedKeyVersion);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8")) as T;
}

async function encryptCarFile(sourcePath: string, destinationPath: string) {
  const { key, keyVersion } = managedEncryptionMaterial();
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await writeFile(destinationPath, Buffer.concat([ENCRYPTED_FILE_MAGIC, iv]), { flag: "wx", mode: 0o600 });
  await pipeline(createReadStream(sourcePath), cipher, createWriteStream(destinationPath, { flags: "a", mode: 0o600 }));
  await appendFile(destinationPath, cipher.getAuthTag());
  return { keyVersion };
}

async function decryptCarFile(sourcePath: string, destinationPath: string, keyVersion: string) {
  const { key } = managedEncryptionMaterial(keyVersion);
  const size = (await stat(sourcePath)).size;
  const headerSize = ENCRYPTED_FILE_MAGIC.length + GCM_IV_BYTES;
  if (size <= headerSize + GCM_TAG_BYTES) throw new Error("Encrypted CAR is truncated");
  const file = await open(sourcePath, "r");
  try {
    const header = Buffer.alloc(headerSize);
    const tag = Buffer.alloc(GCM_TAG_BYTES);
    await file.read(header, 0, header.length, 0);
    await file.read(tag, 0, tag.length, size - tag.length);
    if (!header.subarray(0, ENCRYPTED_FILE_MAGIC.length).equals(ENCRYPTED_FILE_MAGIC)) {
      throw new Error("Encrypted CAR header is invalid");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(ENCRYPTED_FILE_MAGIC.length));
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(sourcePath, { start: headerSize, end: size - GCM_TAG_BYTES - 1 }),
      decipher,
      createWriteStream(destinationPath, { flags: "wx", mode: 0o600 })
    );
  } finally {
    await file.close();
  }
}

type StoredCarReference = {
  bucket: string;
  key: string;
  keyVersion: string;
  version: "macaroni-v35-encrypted-car.v2";
};

function parseStoredCarReference(value: string): StoredCarReference {
  const parsed = JSON.parse(value) as Partial<StoredCarReference>;
  if (!parsed.bucket || !parsed.key || !parsed.keyVersion || parsed.version !== "macaroni-v35-encrypted-car.v2") {
    throw new Error("Encrypted CAR storage reference is invalid");
  }
  return parsed as StoredCarReference;
}

async function uploadEncryptedCar(input: {
  dropId: number;
  tokenId: number;
  kind: "artifact" | "display" | "thumbnail" | "metadata";
  carPath: string;
}) {
  await mkdir(macaroniV35ProcessingRoot(), { recursive: true, mode: 0o700 });
  const work = await mkdtemp(path.join(macaroniV35ProcessingRoot(), "macaroni-v35-encrypt-"));
  const encryptedPath = path.join(work, `${input.kind}.car.enc`);
  try {
    const encrypted = await encryptCarFile(input.carPath, encryptedPath);
    const object = await putObjectFromFile({
      key: `macaroni-v35/private/${input.dropId}/${input.tokenId}/${input.kind}-${randomUUID()}.car.enc`,
      filePath: encryptedPath,
      contentType: "application/octet-stream",
      contentLength: (await stat(encryptedPath)).size,
      metadata: { format: "macaroni-v35-encrypted-car-v2", keyVersion: encrypted.keyVersion },
    });
    return {
      reference: JSON.stringify({
        bucket: object.bucket,
        key: object.key,
        keyVersion: encrypted.keyVersion,
        version: "macaroni-v35-encrypted-car.v2",
      }),
      bucket: object.bucket,
      key: object.key,
      keyVersion: encrypted.keyVersion,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const TZKT_BASE = {
  mainnet: "https://api.tzkt.io/v1",
  shadownet: "https://api.shadownet.tzkt.io/v1",
} as const;

type IndexedPublicToken = {
  id?: number;
  contract?: { address?: string };
  tokenId?: string;
  metadata?: Record<string, unknown> | null;
};

type DuplicateCandidate = {
  artifactCid: string;
  metadata: Record<string, unknown>;
  intendedContract?: string | null;
  intendedTokenId: number;
};

export function assertUniqueManagedMacaroniV35ArtifactRows(rows: readonly {
  tokenId: number;
  artifactCid: string;
  checksumSha256: string;
}[]) {
  const cidOwner = new Map<string, number>();
  const checksumOwner = new Map<string, number>();
  for (const row of rows) {
    const priorCidOwner = cidOwner.get(row.artifactCid);
    const priorChecksumOwner = checksumOwner.get(row.checksumSha256);
    if ((priorCidOwner != null && priorCidOwner !== row.tokenId)
      || (priorChecksumOwner != null && priorChecksumOwner !== row.tokenId)) {
      throw new Error(
        `Token row ${row.tokenId} duplicates the final artifact bytes/CID of token row ${priorCidOwner ?? priorChecksumOwner}; use one token row and increase its quantity for intentional editions`
      );
    }
    cidOwner.set(row.artifactCid, row.tokenId);
    checksumOwner.set(row.checksumSha256, row.tokenId);
  }
}

async function scanPublicTokenMetadataLocally(
  network: keyof typeof TZKT_BASE,
  candidates: readonly DuplicateCandidate[]
) {
  const results = candidates.map(() => ({
    artifactMatches: [] as IndexedPublicToken[],
    metadataMatches: [] as IndexedPublicToken[],
  }));
  const artifactTargets = new Map(candidates.map((candidate, index) => [`ipfs://${candidate.artifactCid}`, index]));
  const metadataTargets = new Map(candidates.map((candidate, index) => [hashMacaroniV35Payload(candidate.metadata), index]));
  const pageLimit = 10_000; // TzKT's documented endpoint maximum.
  let cursor = 0;
  while (true) {
    // Candidate CIDs and metadata never leave wtfOS. Public index pages are
    // mirrored by cursor and compared with the private candidates locally.
    const params = new URLSearchParams({
      "id.gt": String(cursor),
      "metadata.null": "false",
      sort: "asc",
      limit: String(pageLimit),
      select: "id,contract,tokenId,metadata",
    });
    const response = await fetch(`${TZKT_BASE[network]}/tokens?${params}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`TzKT public token mirror failed with HTTP ${response.status}`);
    const rows = await response.json() as IndexedPublicToken[];
    if (!Array.isArray(rows)) throw new Error("TzKT public token mirror returned an invalid response");
    for (const row of rows) {
      if (!Number.isSafeInteger(row.id) || Number(row.id) <= cursor) {
        throw new Error("TzKT public token mirror did not return a monotonic row id");
      }
      cursor = Number(row.id);
      if (!row.metadata || typeof row.metadata !== "object") continue;
      const artifactIndex = artifactTargets.get(String(row.metadata.artifactUri || ""));
      const metadataIndex = metadataTargets.get(hashMacaroniV35Payload(row.metadata));
      const candidateIndexes = new Set<number>();
      if (artifactIndex != null) candidateIndexes.add(artifactIndex);
      if (metadataIndex != null) candidateIndexes.add(metadataIndex);
      for (const index of candidateIndexes) {
        const candidate = candidates[index];
        const outsideIntended = !candidate.intendedContract
          || row.contract?.address !== candidate.intendedContract
          || String(row.tokenId) !== String(candidate.intendedTokenId);
        if (!outsideIntended) continue;
        if (artifactIndex === index) results[index].artifactMatches.push(row);
        if (metadataIndex === index) results[index].metadataMatches.push(row);
      }
    }
    if (rows.length < pageLimit) break;
  }
  return results;
}

export async function checkMacaroniV35IndexedDuplicates(input: {
  network: "mainnet" | "shadownet";
  artifactCid: string;
  metadata: Record<string, unknown>;
  intendedContract?: string | null;
  intendedTokenId: number;
}) {
  return (await scanPublicTokenMetadataLocally(input.network, [input]))[0];
}

export async function stageManagedMacaroniV35Token(input: {
  ownerUserId: number;
  dropId: number;
  registrationDigest: string;
  tokenId: number;
  quantity: number;
  artifactPath: string;
  artifactMimeType: string;
  displayPath?: string;
  displayMimeType?: string;
  thumbnailPath?: string;
  thumbnailMimeType?: string;
  metadata: Record<string, unknown>;
}) {
  const drop = (await db.select().from(macaroniV35Drops).where(and(
    eq(macaroniV35Drops.id, input.dropId),
    eq(macaroniV35Drops.ownerUserId, input.ownerUserId)
  )).limit(1))[0];
  if (!drop) return null;
  if (drop.registrationDigest !== input.registrationDigest) throw new Error("Registration digest does not match this setup");
  if (drop.contract || drop.status !== "setup_required") {
    throw new Error("Private inventory is frozen once contract origination is attached or setup has advanced");
  }
  if (!drop.physicalSupply) throw new Error("The immutable physical supply is missing");
  const [completedStage, existingInventory] = await Promise.all([
    db.select({ status: macaroniV35SetupSteps.status }).from(macaroniV35SetupSteps).where(and(
      eq(macaroniV35SetupSteps.dropId, drop.id),
      eq(macaroniV35SetupSteps.stepKey, "stage_private_assets")
    )).limit(1),
    db.select({
      tokenSlot: macaroniV35PrivateAssets.tokenSlot,
      quantity: macaroniV35PrivateAssets.quantity,
    }).from(macaroniV35PrivateAssets).where(and(
      eq(macaroniV35PrivateAssets.dropId, drop.id),
      eq(macaroniV35PrivateAssets.kind, "metadata")
    )).orderBy(asc(macaroniV35PrivateAssets.tokenSlot)),
  ]);
  if (completedStage[0]?.status === "complete") {
    throw new Error("Private inventory is complete and permanently frozen");
  }
  if (!existingInventory.every((row, index) => row.tokenSlot === index)
    || input.tokenId !== existingInventory.length) {
    throw new Error("Private token rows must be staged contiguously from token id zero");
  }
  const stagedSupply = existingInventory.reduce((sum, row) => sum + row.quantity, 0);
  if (stagedSupply + input.quantity > drop.physicalSupply) {
    throw new Error("This token row would exceed the immutable physical supply");
  }

  await mkdir(macaroniV35ProcessingRoot(), { recursive: true, mode: 0o700 });
  const workspace = await mkdtemp(path.join(macaroniV35ProcessingRoot(), "macaroni-v35-stage-"));
  const artifactCarPath = path.join(workspace, "artifact.car");
  const displayCarPath = path.join(workspace, "display.car");
  const thumbnailCarPath = path.join(workspace, "thumbnail.car");
  const metadataCarPath = path.join(workspace, "metadata.car");
  const uploaded: Array<{ bucket: string; key: string }> = [];
  try {
    const staged = await stageMacaroniPrivateToken({
      artifactSource: createReadStream(input.artifactPath),
      artifactCarPath,
      artifactMimeType: input.artifactMimeType,
      displaySource: input.displayPath ? createReadStream(input.displayPath) : undefined,
      displayCarPath: input.displayPath ? displayCarPath : undefined,
      displayMimeType: input.displayMimeType,
      thumbnailSource: input.thumbnailPath ? createReadStream(input.thumbnailPath) : undefined,
      thumbnailCarPath: input.thumbnailPath ? thumbnailCarPath : undefined,
      thumbnailMimeType: input.thumbnailMimeType,
      metadataCarPath,
      metadata: input.metadata,
    });
    const metadataObject = JSON.parse(Buffer.from(staged.metadataBytes).toString("utf8")) as Record<string, unknown>;
    const metadataNonce = randomBytes(32).toString("hex");
    const metadataUri = `ipfs://${staged.metadata.cid}`;
    const metadataCommitment = macaroniV35MetadataCommitment({
      tokenId: input.tokenId,
      metadataUri,
      metadataNonce,
    });
    const artifactStored = await uploadEncryptedCar({
      dropId: drop.id,
      tokenId: input.tokenId,
      kind: "artifact",
      carPath: artifactCarPath,
    });
    uploaded.push(artifactStored);
    const displayStored = staged.display ? await uploadEncryptedCar({
      dropId: drop.id,
      tokenId: input.tokenId,
      kind: "display",
      carPath: displayCarPath,
    }) : null;
    if (displayStored) uploaded.push(displayStored);
    const thumbnailStored = staged.thumbnail ? await uploadEncryptedCar({
      dropId: drop.id,
      tokenId: input.tokenId,
      kind: "thumbnail",
      carPath: thumbnailCarPath,
    }) : null;
    if (thumbnailStored) uploaded.push(thumbnailStored);
    const metadataStored = await uploadEncryptedCar({
      dropId: drop.id,
      tokenId: input.tokenId,
      kind: "metadata",
      carPath: metadataCarPath,
    });
    uploaded.push(metadataStored);
    const publicPrepin = drop.assetStrategy === "public_prepin_private_manifest";
    if (publicPrepin) {
      await publishManagedMacaroniV35Car({ carPath: artifactCarPath, expectedCid: staged.artifact.cid });
      if (staged.display) await publishManagedMacaroniV35Car({ carPath: displayCarPath, expectedCid: staged.display.cid });
      if (staged.thumbnail) await publishManagedMacaroniV35Car({ carPath: thumbnailCarPath, expectedCid: staged.thumbnail.cid });
      await publishManagedMacaroniV35Car({ carPath: metadataCarPath, expectedCid: staged.metadata.cid });
    }
    const keyVersion = managedMacaroniV35AssetKeyVersion();
    if (artifactStored.keyVersion !== keyVersion || metadataStored.keyVersion !== keyVersion
      || (displayStored && displayStored.keyVersion !== keyVersion)
      || (thumbnailStored && thumbnailStored.keyVersion !== keyVersion)) {
      throw new Error("Private CARs were not encrypted with the active versioned asset key");
    }
    const prepinPublishedAt = publicPrepin ? new Date() : null;
    await db.transaction(async (tx) => {
      await tx.insert(macaroniV35PrivateAssets).values([
        {
          dropId: drop.id,
          tokenSlot: input.tokenId,
          quantity: input.quantity,
          kind: "artifact",
          checksumSha256: await sha256Path(input.artifactPath),
          byteSize: staged.artifact.sourceBytes,
          mimeType: input.artifactMimeType,
          encryptedStorageRef: artifactStored.reference,
          encryptionKeyVersion: keyVersion,
          commitment: sha256Hex(Buffer.from(`artifact:${staged.artifact.cid}`, "utf8")),
          encryptedCidPayload: encryptMacaroniV35PrivatePayload({
            cid: staged.artifact.cid,
            carSha256: staged.artifact.carSha256,
          }),
          publishedCid: publicPrepin ? staged.artifact.cid : null,
          status: publicPrepin ? "published" : "staged",
          publishedAt: prepinPublishedAt,
        },
        ...(staged.display && displayStored && input.displayPath ? [{
          dropId: drop.id,
          tokenSlot: input.tokenId,
          quantity: input.quantity,
          kind: "display" as const,
          checksumSha256: await sha256Path(input.displayPath),
          byteSize: staged.display.sourceBytes,
          mimeType: input.displayMimeType || "application/octet-stream",
          encryptedStorageRef: displayStored.reference,
          encryptionKeyVersion: keyVersion,
          commitment: sha256Hex(Buffer.from(`display:${staged.display.cid}`, "utf8")),
          encryptedCidPayload: encryptMacaroniV35PrivatePayload({
            cid: staged.display.cid,
            carSha256: staged.display.carSha256,
          }),
          publishedCid: publicPrepin ? staged.display.cid : null,
          status: publicPrepin ? "published" as const : "staged" as const,
          publishedAt: prepinPublishedAt,
        }] : []),
        ...(staged.thumbnail && thumbnailStored && input.thumbnailPath ? [{
          dropId: drop.id,
          tokenSlot: input.tokenId,
          quantity: input.quantity,
          kind: "thumbnail" as const,
          checksumSha256: await sha256Path(input.thumbnailPath),
          byteSize: staged.thumbnail.sourceBytes,
          mimeType: input.thumbnailMimeType || "application/octet-stream",
          encryptedStorageRef: thumbnailStored.reference,
          encryptionKeyVersion: keyVersion,
          commitment: sha256Hex(Buffer.from(`thumbnail:${staged.thumbnail.cid}`, "utf8")),
          encryptedCidPayload: encryptMacaroniV35PrivatePayload({
            cid: staged.thumbnail.cid,
            carSha256: staged.thumbnail.carSha256,
          }),
          publishedCid: publicPrepin ? staged.thumbnail.cid : null,
          status: publicPrepin ? "published" as const : "staged" as const,
          publishedAt: prepinPublishedAt,
        }] : []),
        {
          dropId: drop.id,
          tokenSlot: input.tokenId,
          quantity: input.quantity,
          kind: "metadata",
          checksumSha256: createHash("sha256").update(staged.metadataBytes).digest("hex"),
          byteSize: staged.metadata.sourceBytes,
          mimeType: "application/json",
          encryptedStorageRef: metadataStored.reference,
          encryptionKeyVersion: keyVersion,
          commitment: metadataCommitment,
          encryptedCidPayload: encryptMacaroniV35PrivatePayload({
            cid: staged.metadata.cid,
            metadataUri,
            metadataNonce,
            metadata: metadataObject,
            carSha256: staged.metadata.carSha256,
          }),
          publishedCid: publicPrepin ? staged.metadata.cid : null,
          status: publicPrepin ? "published" : "staged",
          publishedAt: prepinPublishedAt,
        },
      ]);
      const inventory = await tx.select({
        tokenSlot: macaroniV35PrivateAssets.tokenSlot,
        quantity: macaroniV35PrivateAssets.quantity,
      }).from(macaroniV35PrivateAssets).where(and(
        eq(macaroniV35PrivateAssets.dropId, drop.id),
        eq(macaroniV35PrivateAssets.kind, "metadata")
      )).orderBy(asc(macaroniV35PrivateAssets.tokenSlot));
      const contiguous = inventory.every((row, index) => row.tokenSlot === index);
      const physicalSupply = inventory.reduce((sum, row) => sum + row.quantity, 0);
      if (!contiguous || physicalSupply > drop.physicalSupply!) {
        throw new Error("Concurrent private staging would create a gap or exceed immutable physical supply");
      }
      if (contiguous && physicalSupply === drop.physicalSupply) {
        const expectedPostcondition = {
          tokenRows: inventory.length,
          physicalSupply,
          exactCarsRetained: true,
          duplicateCidScanDeferredToActivation: true,
        };
        const intentDigest = hashMacaroniV35Payload(expectedPostcondition);
        await tx.insert(macaroniV35SetupSteps).values({
          dropId: drop.id,
          stepKey: "stage_private_assets",
          status: "complete",
          intentDigest,
          expectedPostcondition,
          parameters: null,
          network: drop.network,
          signer: null,
          target: null,
          entrypoint: "offchain:stage_private_assets",
          amountMutez: 0,
          completedAt: new Date(),
          details: { importProfile: staged.artifact.importProfile.schema },
        }).onConflictDoUpdate({
          target: [macaroniV35SetupSteps.dropId, macaroniV35SetupSteps.stepKey],
          set: { status: "complete", completedAt: new Date(), updatedAt: new Date() },
        });
      }
    });
    return {
      dropId: drop.id,
      tokenId: input.tokenId,
      quantity: input.quantity,
      metadataCommitment,
      tokenRowStaged: true,
    };
  } catch (error) {
    for (const object of uploaded) await deleteObject(object).catch(() => undefined);
    throw error;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function recheckManagedMacaroniV35IndexedDuplicates(dropId: number) {
  const drop = (await db.select().from(macaroniV35Drops)
    .where(eq(macaroniV35Drops.id, dropId)).limit(1))[0];
  if (!drop) throw new Error("Macaroni V3.5 drop not found");
  const assets = await db.select().from(macaroniV35PrivateAssets)
    .where(eq(macaroniV35PrivateAssets.dropId, drop.id))
    .orderBy(asc(macaroniV35PrivateAssets.tokenSlot));
  const byToken = new Map<number, typeof assets>();
  for (const asset of assets) {
    const rows = byToken.get(asset.tokenSlot) ?? [];
    rows.push(asset);
    byToken.set(asset.tokenSlot, rows);
  }
  const candidates: DuplicateCandidate[] = [];
  const candidateTokenIds: number[] = [];
  const localArtifacts: Array<{ tokenId: number; artifactCid: string; checksumSha256: string }> = [];
  for (const [tokenId, rows] of byToken) {
    const artifact = rows.find((row) => row.kind === "artifact");
    const metadata = rows.find((row) => row.kind === "metadata");
    if (!artifact?.encryptedCidPayload || !metadata?.encryptedCidPayload) {
      throw new Error(`Token row ${tokenId} is missing an encrypted CID mapping`);
    }
    const artifactPrivate = decryptMacaroniV35PrivatePayload<{ cid: string }>(artifact.encryptedCidPayload);
    const metadataPrivate = decryptMacaroniV35PrivatePayload<{
      cid: string;
      metadata: Record<string, unknown>;
    }>(metadata.encryptedCidPayload);
    if (!metadataPrivate.metadata || typeof metadataPrivate.metadata !== "object") {
      throw new Error(`Token row ${tokenId} predates the required encrypted duplicate-scan manifest`);
    }
    candidates.push({
      artifactCid: artifactPrivate.cid,
      metadata: metadataPrivate.metadata,
      intendedContract: drop.contract,
      intendedTokenId: tokenId,
    });
    localArtifacts.push({
      tokenId,
      artifactCid: artifactPrivate.cid,
      checksumSha256: artifact.checksumSha256,
    });
    candidateTokenIds.push(tokenId);
  }
  // This comparison never leaves the managed private boundary. Editions are
  // represented by quantity on one token row; identical final artifacts may
  // not be disguised behind different metadata documents on separate rows.
  assertUniqueManagedMacaroniV35ArtifactRows(localArtifacts);
  const duplicates = await scanPublicTokenMetadataLocally(drop.network, candidates);
  for (let index = 0; index < duplicates.length; index += 1) {
    const duplicate = duplicates[index];
    if (duplicate.artifactMatches.length || duplicate.metadataMatches.length) {
      throw new Error(`Token row ${candidateTokenIds[index]} now matches an already minted artifact or metadata record`);
    }
  }
  return { checkedTokenRows: byToken.size, passed: true as const };
}

export async function materializeManagedMacaroniV35Car(input: {
  encryptedStorageRef: string;
  encryptedCidPayload: string;
  destinationPath: string;
}) {
  const reference = parseStoredCarReference(input.encryptedStorageRef);
  const privateData = decryptMacaroniV35PrivatePayload<{ cid: string; carSha256: string }>(input.encryptedCidPayload);
  await mkdir(macaroniV35ProcessingRoot(), { recursive: true, mode: 0o700 });
  const workspace = await mkdtemp(path.join(macaroniV35ProcessingRoot(), "macaroni-v35-materialize-"));
  const encryptedPath = path.join(workspace, "content.car.enc");
  try {
    await downloadObjectToFile({ bucket: reference.bucket, key: reference.key, destinationPath: encryptedPath });
    await mkdir(path.dirname(input.destinationPath), { recursive: true });
    await decryptCarFile(encryptedPath, input.destinationPath, reference.keyVersion);
    const verified = await verifyMacaroniPrivateCar({ carPath: input.destinationPath, expectedCid: privateData.cid });
    if (!verified.valid) throw new Error("Recovered CAR does not match its private precommitment");
    return { cid: privateData.cid, carSha256: privateData.carSha256 };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function publishManagedMacaroniV35Car(input: { carPath: string; expectedCid: string }) {
  const publisher = managedMacaroniV35CarPublisherConfig();
  if (!publisher) throw new Error("Managed CAR publishing is not configured");
  const verified = await verifyMacaroniPrivateCar({ carPath: input.carPath, expectedCid: input.expectedCid });
  if (!verified.valid) throw new Error("Refusing to publish a CAR whose root differs from the committed CID");
  let returnedCid: string | undefined;
  if (publisher.mode === "pinata_v3") {
    const blob = await openAsBlob(input.carPath, { type: "application/vnd.ipld.car" });
    const file = new File([blob], `${input.expectedCid}.car`, { type: "application/vnd.ipld.car" });
    // Pinata's reviewed SDK switches to resumable TUS uploads for large files
    // and marks every method (including TUS) as a public, single-root CAR.
    const result = await new PinataSDK({ pinataJwt: publisher.token })
      .upload.public.file(file)
      .name(`${input.expectedCid}.car`)
      .car();
    returnedCid = result.cid || undefined;
  } else {
    const body = new FormData();
    body.set("file", await openAsBlob(input.carPath, { type: "application/vnd.ipld.car" }), path.basename(input.carPath));
    body.set("expectedRoot", input.expectedCid);
    const response = await fetch(publisher.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${publisher.token}` },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Managed CAR publishing failed with HTTP ${response.status}`);
    const result = await response.json() as { cid?: string };
    returnedCid = result.cid;
  }
  if (returnedCid !== input.expectedCid) throw new Error("CAR publisher returned a CID that differs from the precommitment");
  return { cid: input.expectedCid };
}

export function buildPublishedMacaroniV35CidCandidates(
  cid: string,
  configuredGateway: string | null | undefined = process.env.MACARONI_V35_IPFS_GATEWAY
): string[] {
  const configured = String(configuredGateway || "").trim();
  const gateways = configured
    ? [configured, ...DEFAULT_IPFS_GATEWAYS]
    : DEFAULT_IPFS_GATEWAYS;
  return buildIpfsGatewayCandidates(`ipfs://${cid}`, gateways);
}

export async function verifyPublishedMacaroniV35Cid(cid: string) {
  for (const candidate of buildPublishedMacaroniV35CidCandidates(cid)) {
    try {
      const response = await fetch(candidate, {
        headers: { range: "bytes=0-0" },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      const available = response.ok || response.status === 206;
      await response.body?.cancel().catch(() => undefined);
      if (available) return true;
    } catch {
      // Continue through the independent public gateway candidates.
    }
  }
  return false;
}

export function managedMacaroniV35AssetRuntimeConfigured() {
  try {
    managedEncryptionKeyring();
  } catch {
    return false;
  }
  return Boolean(
    process.env.S3_ENDPOINT
    && process.env.S3_BUCKET
    && process.env.S3_ACCESS_KEY_ID
    && process.env.S3_SECRET_ACCESS_KEY
    && managedMacaroniV35CarPublisherConfig()
  );
}
