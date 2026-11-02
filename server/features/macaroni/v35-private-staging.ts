import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CarReader } from "@ipld/car";
import { CarWriter } from "@ipld/car/writer";
import { importer, type ImportContent } from "ipfs-unixfs-importer";
import { fixedSize } from "ipfs-unixfs-importer/chunker";
import { balanced } from "ipfs-unixfs-importer/layout";
import type { CID } from "multiformats/cid";
import { macaroniV35ProcessingRoot } from "./v35-temp-storage";

export const MACARONI_V35_IMPORT_PROFILE = Object.freeze({
  schema: "wtfos.macaroni-unixfs-import.v1",
  importer: "ipfs-unixfs-importer@17.0.1",
  profile: "unixfs-v1-2025" as const,
  cidVersion: 1 as const,
  multihash: "sha2-256",
  rawLeaves: true,
  reduceSingleLeafToSelf: true,
  chunker: "fixed-size",
  chunkSizeBytes: 1_048_576,
  layout: "balanced",
  maxChildrenPerNode: 1_024,
  wrapWithDirectory: false,
  carVersion: 1 as const,
});

type PrivateStageSource = Uint8Array | AsyncIterable<Uint8Array> | Iterable<Uint8Array>;

type StoredBlock = { cid: CID; filePath: string; size: number };

class PrivateDiskBlockWriter {
  readonly blocks = new Map<string, StoredBlock>();

  constructor(private readonly root: string) {}

  async put(cid: CID, bytes: Uint8Array): Promise<CID> {
    const key = cid.toString();
    const filePath = path.join(this.root, encodeURIComponent(key));
    if (!this.blocks.has(key)) {
      await writeFile(filePath, bytes, { flag: "wx" });
      this.blocks.set(key, { cid, filePath, size: bytes.byteLength });
    }
    return cid;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

export function canonicalMacaroniMetadataBytes(metadata: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(canonicalJson(metadata));
}

async function * countedSource(
  source: PrivateStageSource,
  count: { bytes: number }
): AsyncGenerator<Uint8Array> {
  if (source instanceof Uint8Array) {
    count.bytes += source.byteLength;
    yield source;
    return;
  }
  for await (const chunk of source as AsyncIterable<Uint8Array>) {
    if (!(chunk instanceof Uint8Array)) throw new Error("Private staging source yielded a non-byte chunk");
    count.bytes += chunk.byteLength;
    yield chunk;
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function writeCarAtomically(
  carPath: string,
  root: CID,
  blocks: readonly StoredBlock[]
): Promise<void> {
  await mkdir(path.dirname(carPath), { recursive: true });
  const partialPath = `${carPath}.partial-${randomUUID()}`;
  const { writer, out } = CarWriter.create([root]);
  const streamDone = pipeline(Readable.from(out), createWriteStream(partialPath, { flags: "wx", mode: 0o600 }));
  try {
    for (const block of [...blocks].sort((a, b) => a.cid.toString().localeCompare(b.cid.toString()))) {
      await writer.put({ cid: block.cid, bytes: await readFile(block.filePath) });
    }
    await writer.close();
    await streamDone;
    await link(partialPath, carPath);
  } finally {
    await unlink(partialPath).catch(() => undefined);
  }
}

export async function stageMacaroniPrivateContentToCar(input: {
  source: PrivateStageSource;
  carPath: string;
}): Promise<{
  cid: string;
  carPath: string;
  carSha256: string;
  sourceBytes: number;
  blockCount: number;
  chunkSizeBytes: number;
  importProfile: typeof MACARONI_V35_IMPORT_PROFILE;
}> {
  await mkdir(macaroniV35ProcessingRoot(), { recursive: true, mode: 0o700 });
  const tempRoot = await mkdtemp(path.join(macaroniV35ProcessingRoot(), "macaroni-v35-blocks-"));
  const blockstore = new PrivateDiskBlockWriter(tempRoot);
  const count = { bytes: 0 };
  let root: CID | null = null;
  try {
    for await (const entry of importer(
      [{ content: countedSource(input.source, count) as ImportContent }],
      blockstore,
      {
        profile: MACARONI_V35_IMPORT_PROFILE.profile,
        cidVersion: MACARONI_V35_IMPORT_PROFILE.cidVersion,
        rawLeaves: MACARONI_V35_IMPORT_PROFILE.rawLeaves,
        reduceSingleLeafToSelf: MACARONI_V35_IMPORT_PROFILE.reduceSingleLeafToSelf,
        wrapWithDirectory: MACARONI_V35_IMPORT_PROFILE.wrapWithDirectory,
        chunker: fixedSize({ chunkSize: MACARONI_V35_IMPORT_PROFILE.chunkSizeBytes }),
        layout: balanced({ maxChildrenPerNode: MACARONI_V35_IMPORT_PROFILE.maxChildrenPerNode }),
        fileImportConcurrency: 1,
        blockWriteConcurrency: 1,
      }
    )) {
      root = entry.cid;
    }
    if (!root) throw new Error("UnixFS importer did not produce a root CID");
    await writeCarAtomically(input.carPath, root, [...blockstore.blocks.values()]);
    return {
      cid: root.toString(),
      carPath: input.carPath,
      carSha256: await sha256File(input.carPath),
      sourceBytes: count.bytes,
      blockCount: blockstore.blocks.size,
      chunkSizeBytes: MACARONI_V35_IMPORT_PROFILE.chunkSizeBytes,
      importProfile: MACARONI_V35_IMPORT_PROFILE,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export async function stageMacaroniPrivateFileToCar(input: {
  sourcePath: string;
  carPath: string;
}) {
  return stageMacaroniPrivateContentToCar({
    source: createReadStream(input.sourcePath),
    carPath: input.carPath,
  });
}

export async function stageMacaroniPrivateToken(input: {
  artifactSource: PrivateStageSource;
  artifactCarPath: string;
  artifactMimeType?: string;
  displaySource?: PrivateStageSource;
  displayCarPath?: string;
  displayMimeType?: string;
  thumbnailSource?: PrivateStageSource;
  thumbnailCarPath?: string;
  thumbnailMimeType?: string;
  metadataCarPath: string;
  metadata: Record<string, unknown>;
}) {
  const artifact = await stageMacaroniPrivateContentToCar({
    source: input.artifactSource,
    carPath: input.artifactCarPath,
  });
  const display = input.displaySource && input.displayCarPath
    ? await stageMacaroniPrivateContentToCar({ source: input.displaySource, carPath: input.displayCarPath })
    : null;
  const thumbnail = input.thumbnailSource && input.thumbnailCarPath
    ? await stageMacaroniPrivateContentToCar({ source: input.thumbnailSource, carPath: input.thumbnailCarPath })
    : null;
  const artifactUri = `ipfs://${artifact.cid}`;
  const displayUri = display ? `ipfs://${display.cid}` : undefined;
  const thumbnailUri = thumbnail ? `ipfs://${thumbnail.cid}` : undefined;
  const formats = [
    { uri: artifactUri, mimeType: input.artifactMimeType || "application/octet-stream", fileSize: artifact.sourceBytes },
    ...(display && displayUri
      ? [{ uri: displayUri, mimeType: input.displayMimeType || "application/octet-stream", fileSize: display.sourceBytes }]
      : []),
    ...(thumbnail && thumbnailUri
      ? [{ uri: thumbnailUri, mimeType: input.thumbnailMimeType || "application/octet-stream", fileSize: thumbnail.sourceBytes }]
      : []),
  ];
  const metadataBytes = canonicalMacaroniMetadataBytes({
    ...input.metadata,
    artifactUri,
    ...(displayUri ? { displayUri } : {}),
    ...(thumbnailUri ? { thumbnailUri } : {}),
    formats,
  });
  const metadata = await stageMacaroniPrivateContentToCar({
    source: metadataBytes,
    carPath: input.metadataCarPath,
  });
  return { artifact, display, thumbnail, metadata, metadataBytes };
}

export async function verifyMacaroniPrivateCar(input: {
  carPath: string;
  expectedCid: string;
}): Promise<{ valid: boolean; roots: string[]; blockCount: number }> {
  const reader = await CarReader.fromIterable(createReadStream(input.carPath));
  const roots = (await reader.getRoots()).map((root) => root.toString());
  let blockCount = 0;
  for await (const _block of reader.blocks()) blockCount += 1;
  return {
    valid: roots.length === 1 && roots[0] === input.expectedCid && blockCount > 0,
    roots,
    blockCount,
  };
}
