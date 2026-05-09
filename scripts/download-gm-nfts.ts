import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_GM_NFT_CACHE_DIR,
  GM_WELCOME_AUTHOR_ADDRESS,
  GM_WELCOME_AUTHOR_NAME,
  GM_WELCOME_COLLECTION_URL,
  GM_WELCOME_PROJECT_ID,
  GM_WELCOME_PROJECT_NAME,
  type GmNftManifest,
  type GmNftManifestAsset,
} from "../server/auth/gm-welcome";

const FXHASH_GRAPHQL_URL =
  process.env.FXHASH_GRAPHQL_URL?.trim() ||
  "https://api.fxhash.xyz/graphql/";
const CACHE_DIR =
  process.env.GM_NFT_CACHE_DIR?.trim() || DEFAULT_GM_NFT_CACHE_DIR;
const PAGE_SIZE = Math.min(Number(process.env.GM_NFT_PAGE_SIZE || 50), 50);
const CONCURRENCY = Number(process.env.GM_NFT_DOWNLOAD_CONCURRENCY || 4);
const FETCH_TIMEOUT_MS = Number(process.env.GM_NFT_FETCH_TIMEOUT_MS || 20_000);
const MAX_ASSET_BYTES = Number(process.env.GM_NFT_MAX_ASSET_BYTES || 25_000_000);
const DRY_RUN = process.argv.includes("--dry-run");
const GATEWAYS = (
  process.env.GM_NFT_IPFS_GATEWAYS ||
  process.env.TV_IPFS_GATEWAYS ||
  "https://ipfs.io/ipfs/,https://cloudflare-ipfs.com/ipfs/,https://nftstorage.link/ipfs/"
)
  .split(",")
  .map((gateway) => gateway.trim())
  .filter(Boolean)
  .map((gateway) => gateway.replace(/\/?$/, "/"));

type FxhashObjkt = {
  id: string;
  onChainId: number | null;
  name: string;
  iteration: number | null;
  generationHash: string | null;
  displayUri: string | null;
  thumbnailUri: string | null;
  metadataUri: string | null;
  captureMedia: {
    cid: string | null;
    width: number | null;
    height: number | null;
    mimeType: string | null;
  } | null;
};

type FxhashGenerativeToken = {
  id: number;
  name: string;
  objktsCount: number;
  issuerContractAddress: string | null;
  author: { id: string; name: string | null } | null;
  objkts: FxhashObjkt[];
};

const TOKEN_QUERY = `query($id: Float!, $skip: Int!, $take: Int!) {
  generativeToken(id: $id) {
    id
    name
    objktsCount
    issuerContractAddress
    author { id name }
    objkts(skip: $skip, take: $take, filters: { assigned_eq: true }) {
      id
      onChainId
      name
      iteration
      generationHash
      displayUri
      thumbnailUri
      metadataUri
      captureMedia { cid width height mimeType }
    }
  }
}`;

function parseCacheDirFromArgs(): string {
  const direct = process.argv.find((arg) => arg.startsWith("--cache-dir="));
  return direct ? direct.slice("--cache-dir=".length) : CACHE_DIR;
}

function ipfsUriFromCidOrUri(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("ipfs://")) return value;
  if (/^[a-z0-9]+$/i.test(value)) return `ipfs://${value}`;
  return value;
}

function ipfsGatewayUrls(uri: string): string[] {
  if (!uri.startsWith("ipfs://")) return [uri];
  const ipfsPath = uri.slice("ipfs://".length);
  return GATEWAYS.map((gateway) => `${gateway}${ipfsPath}`);
}

function extensionForMime(mimeType: string | null | undefined): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/svg+xml") return ".svg";
  return ".png";
}

function filenameForObjkt(objkt: FxhashObjkt): string {
  const iteration = String(objkt.iteration ?? objkt.onChainId ?? objkt.id).padStart(
    6,
    "0"
  );
  const ext = extensionForMime(objkt.captureMedia?.mimeType);
  return `fxhash-${GM_WELCOME_PROJECT_ID}-gm-${iteration}${ext}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function queryFxhashPage(
  skip: number,
  take: number
): Promise<FxhashGenerativeToken> {
  const response = await fetchWithTimeout(FXHASH_GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: TOKEN_QUERY,
      variables: { id: GM_WELCOME_PROJECT_ID, skip, take },
    }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(
      `fxhash query failed: ${response.status} ${JSON.stringify(
        payload.errors || payload
      )}`
    );
  }
  const token = payload.data?.generativeToken as FxhashGenerativeToken | null;
  if (!token) throw new Error(`fxhash project ${GM_WELCOME_PROJECT_ID} missing`);
  return token;
}

async function listObjkts(): Promise<FxhashGenerativeToken> {
  const first = await queryFxhashPage(0, PAGE_SIZE);
  const objkts = [...first.objkts];
  for (let skip = PAGE_SIZE; skip < first.objktsCount; skip += PAGE_SIZE) {
    const page = await queryFxhashPage(skip, PAGE_SIZE);
    objkts.push(...page.objkts);
  }
  return { ...first, objkts };
}

function normalizeAsset(objkt: FxhashObjkt): GmNftManifestAsset {
  const sourceUri =
    ipfsUriFromCidOrUri(objkt.captureMedia?.cid) ||
    ipfsUriFromCidOrUri(objkt.displayUri) ||
    ipfsUriFromCidOrUri(objkt.thumbnailUri);
  if (!sourceUri) throw new Error(`No image URI for ${objkt.id}`);

  return {
    id: objkt.id,
    onChainId: objkt.onChainId ?? null,
    iteration: objkt.iteration ?? null,
    name: objkt.name,
    generationHash: objkt.generationHash ?? null,
    displayUri: objkt.displayUri ?? null,
    thumbnailUri: objkt.thumbnailUri ?? null,
    metadataUri: objkt.metadataUri ?? null,
    captureCid: objkt.captureMedia?.cid ?? null,
    sourceUri,
    filename: filenameForObjkt(objkt),
    mimeType: objkt.captureMedia?.mimeType ?? null,
    width: objkt.captureMedia?.width ?? null,
    height: objkt.captureMedia?.height ?? null,
  };
}

async function downloadAsset(
  asset: GmNftManifestAsset,
  cacheDir: string
): Promise<GmNftManifestAsset> {
  const target = path.join(cacheDir, asset.filename);
  const existing = await fs.stat(target).catch(() => null);
  if (existing?.isFile()) {
    return { ...asset, sizeBytes: existing.size };
  }

  let lastError: unknown = null;
  for (const url of ipfsGatewayUrls(asset.sourceUri)) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_ASSET_BYTES) {
        throw new Error(`asset too large: ${contentLength} bytes`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_ASSET_BYTES) {
        throw new Error(`asset too large: ${buffer.length} bytes`);
      }
      const contentType = response.headers.get("content-type");
      const tmp = `${target}.${createHash("sha1")
        .update(`${asset.id}:${Date.now()}`)
        .digest("hex")
        .slice(0, 8)}.tmp`;
      await fs.writeFile(tmp, buffer);
      await fs.rename(tmp, target);
      return {
        ...asset,
        mimeType: asset.mimeType || contentType,
        sizeBytes: buffer.length,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Failed to download ${asset.id}: ${String(lastError)}`);
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker)
  );
  return results;
}

async function main() {
  const cacheDir = parseCacheDirFromArgs();
  await fs.mkdir(cacheDir, { recursive: true });

  const token = await listObjkts();
  const assets = token.objkts
    .map(normalizeAsset)
    .sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));

  console.log(
    `[gm-nfts] ${token.name} project ${token.id}: ${assets.length}/${token.objktsCount} assigned objkts`
  );

  const downloaded = DRY_RUN
    ? assets
    : await mapConcurrent(assets, CONCURRENCY, async (asset, index) => {
        const result = await downloadAsset(asset, cacheDir);
        console.log(
          `[gm-nfts] ${index + 1}/${assets.length} cached ${result.filename}`
        );
        return result;
      });

  const manifest: GmNftManifest = {
    projectId: GM_WELCOME_PROJECT_ID,
    projectName: GM_WELCOME_PROJECT_NAME,
    collectionUrl: GM_WELCOME_COLLECTION_URL,
    authorName: token.author?.name || GM_WELCOME_AUTHOR_NAME,
    authorAddress: token.author?.id || GM_WELCOME_AUTHOR_ADDRESS,
    generatedAt: new Date().toISOString(),
    assets: downloaded,
  };

  if (!DRY_RUN) {
    await fs.writeFile(
      path.join(cacheDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
  }

  console.log(
    `[gm-nfts] ${DRY_RUN ? "dry-run complete" : "manifest written"}: ${path.join(
      cacheDir,
      "manifest.json"
    )}`
  );
}

main().catch((err) => {
  console.error("[gm-nfts] failed:", err);
  process.exit(1);
});
