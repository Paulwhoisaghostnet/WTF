import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CarReader } from "@ipld/car";
import { CarWriter } from "@ipld/car/writer";
import { importer } from "ipfs-unixfs-importer";
import { fixedSize } from "ipfs-unixfs-importer/chunker";
import { balanced } from "ipfs-unixfs-importer/layout";

export const IMPORT_PROFILE = Object.freeze({
  schema: "wtfos.macaroni-unixfs-import.v1",
  importer: "ipfs-unixfs-importer@17.0.1",
  profile: "unixfs-v1-2025",
  cidVersion: 1,
  multihash: "sha2-256",
  rawLeaves: true,
  reduceSingleLeafToSelf: true,
  chunker: "fixed-size",
  chunkSizeBytes: 1_048_576,
  layout: "balanced",
  maxChildrenPerNode: 1_024,
  wrapWithDirectory: false,
  carVersion: 1,
});

class DiskBlocks {
  blocks = new Map();
  constructor(root) { this.root = root; }
  async put(cid, bytes) {
    const key = cid.toString();
    if (this.blocks.has(key)) return cid;
    const filePath = path.join(this.root, encodeURIComponent(key));
    await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
    this.blocks.set(key, { cid, filePath });
    return cid;
  }
}

async function writeCar(carPath, root, blocks) {
  await mkdir(path.dirname(carPath), { recursive: true, mode: 0o700 });
  const partial = `${carPath}.partial-${randomUUID()}`;
  const { writer, out } = CarWriter.create([root]);
  const done = pipeline(Readable.from(out), createWriteStream(partial, { flags: "wx", mode: 0o600 }));
  try {
    for (const block of [...blocks].sort((a, b) => a.cid.toString().localeCompare(b.cid.toString()))) {
      await writer.put({ cid: block.cid, bytes: await readFile(block.filePath) });
    }
    await writer.close();
    await done;
    await link(partial, carPath);
  } finally {
    await unlink(partial).catch(() => {});
  }
}

export async function stageToCar({ source, carPath }) {
  const temp = await mkdtemp(path.join(tmpdir(), "macaroni-companion-blocks-"));
  const blocks = new DiskBlocks(temp);
  let root;
  try {
    for await (const entry of importer([{ content: source }], blocks, {
      profile: IMPORT_PROFILE.profile,
      cidVersion: IMPORT_PROFILE.cidVersion,
      rawLeaves: IMPORT_PROFILE.rawLeaves,
      reduceSingleLeafToSelf: IMPORT_PROFILE.reduceSingleLeafToSelf,
      wrapWithDirectory: IMPORT_PROFILE.wrapWithDirectory,
      chunker: fixedSize({ chunkSize: IMPORT_PROFILE.chunkSizeBytes }),
      layout: balanced({ maxChildrenPerNode: IMPORT_PROFILE.maxChildrenPerNode }),
      fileImportConcurrency: 1,
      blockWriteConcurrency: 1,
    })) root = entry.cid;
    if (!root) throw new Error("UnixFS importer produced no root");
    await writeCar(carPath, root, [...blocks.blocks.values()]);
    return {
      cid: root.toString(),
      carPath,
      carSha256: createHash("sha256").update(await readFile(carPath)).digest("hex"),
      blockCount: blocks.blocks.size,
      profile: IMPORT_PROFILE,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export function canonicalMetadataBytes(value) {
  function encode(item) {
    if (item === null || typeof item !== "object") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(encode).join(",")}]`;
    return `{${Object.entries(item).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${encode(child)}`).join(",")}}`;
  }
  return new TextEncoder().encode(encode(value));
}

export async function stageToken({
  artifactPath,
  artifactCarPath,
  displayPath = null,
  displayCarPath = null,
  thumbnailPath = null,
  thumbnailCarPath = null,
  metadataCarPath,
  metadata,
}) {
  const artifact = await stageToCar({ source: createReadStream(artifactPath), carPath: artifactCarPath });
  const display = displayPath && displayCarPath
    ? await stageToCar({ source: createReadStream(displayPath), carPath: displayCarPath })
    : null;
  const thumbnail = thumbnailPath && thumbnailCarPath
    ? await stageToCar({ source: createReadStream(thumbnailPath), carPath: thumbnailCarPath })
    : null;
  const metadataBytes = canonicalMetadataBytes({
    ...metadata,
    artifactUri: `ipfs://${artifact.cid}`,
    ...(display ? { displayUri: `ipfs://${display.cid}` } : {}),
    ...(thumbnail ? { thumbnailUri: `ipfs://${thumbnail.cid}` } : {}),
  });
  const stagedMetadata = await stageToCar({ source: metadataBytes, carPath: metadataCarPath });
  return { artifact, display, thumbnail, metadata: stagedMetadata, metadataBytes };
}

export async function verifyCar(carPath, expectedCid) {
  const reader = await CarReader.fromIterable(createReadStream(carPath));
  const roots = (await reader.getRoots()).map(String);
  let blocks = 0;
  for await (const _block of reader.blocks()) blocks += 1;
  return { valid: roots.length === 1 && roots[0] === expectedCid && blocks > 0, roots, blocks };
}
