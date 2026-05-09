import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const TMP_DIR = path.join(os.tmpdir(), "wtf-game-studio-open-assets");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_ASSET_MAX_BYTES = 2 * 1024 * 1024;
const MODEL_ASSET_MAX_BYTES = 48 * 1024 * 1024;
const IMPORT_FETCH_TIMEOUT_MS = Math.max(1_000, Number(process.env.IMPORT_FETCH_TIMEOUT_MS || "30000"));

const MODEL_MIME_TYPES = new Set([
  "model/gltf-binary",
  "model/gltf+json",
  "model/obj",
  "model/mtl",
  "application/octet-stream",
]);

const OBJKT_GRAPHQL_URL = process.env.OBJKT_GRAPHQL_URL || "https://data.objkt.com/v3/graphql";
const OBJKT_QUERY_PAGE_SIZE = Math.max(10, Number(process.env.OBJKT_QUERY_PAGE_SIZE || "60"));
const OBJKT_MAX_MODELS_TO_IMPORT = Math.max(1, Number(process.env.OBJKT_MAX_MODELS_TO_IMPORT || "80"));
const OBJKT_MAX_MODEL_QUERIES = Math.max(1, Number(process.env.OBJKT_MAX_MODEL_QUERIES || "20"));
const POLYHAVEN_ASSET_API = process.env.POLYHAVEN_ASSET_API || "https://api.polyhaven.com/assets?type=models";
const POLYHAVEN_FILE_API = process.env.POLYHAVEN_FILE_API || "https://api.polyhaven.com/files";
const POLYHAVEN_PREFERRED_RESOLUTIONS = process.env.POLYHAVEN_PREFERRED_RESOLUTIONS || "4k,2k,1k";
const POLYHAVEN_MAX_MODELS_TO_IMPORT = Math.max(1, Number(process.env.POLYHAVEN_MAX_MODELS_TO_IMPORT || "20"));
const POLYHAVEN_MAX_FILES_PER_CANDIDATE = Math.max(1, Number(process.env.POLYHAVEN_MAX_FILES_PER_CANDIDATE || "20"));
const OBJKT_IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://w3s.link/ipfs/",
  "https://dweb.link/ipfs/",
];
const OBJKT_MODELS_ROOT = "public/game-studio-assets/cc0/objkt/models";
const POLYHAVEN_MODELS_ROOT = "public/game-studio-assets/cc0/polyhaven/models";

const OPEN_LICENSE_PROFILES = [
  {
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    tags: ["cc0"],
    matchers: [/cc0/i, /creative commons zero/i, /public domain/i],
  },
  {
    license: "MIT",
    licenseUrl: "https://opensource.org/license/mit/",
    tags: ["mit"],
    matchers: [/(\bmit\b|mit license)/i],
  },
];

const PACKS = [
  {
    name: "Kenney Pixel Platformer",
    author: "Kenney",
    sourceUrl: "https://kenney.nl/assets/pixel-platformer",
    downloadUrl:
      "https://kenney.nl/media/pages/assets/pixel-platformer/bef991136c-1696667883/kenney_pixel-platformer.zip",
    license: "CC0-1.0",
    licenseEntry: "License.txt",
    outputDir: "public/game-studio-assets/cc0/kenney/pixel-platformer",
    assets: [
      { entry: "Tilemap/tilemap.png", output: "tilemap.png" },
      { entry: "Tilemap/tilemap_packed.png", output: "tilemap-packed.png" },
      { entry: "Tilemap/tilemap-characters.png", output: "characters.png" },
      { entry: "Tilemap/tilemap-backgrounds.png", output: "backgrounds.png" },
      { entry: "Tiles/Characters/tile_0000.png", output: "character-hero-a.png" },
      { entry: "Tiles/Characters/tile_0008.png", output: "character-hero-b.png" },
      { entry: "Tiles/Characters/tile_0016.png", output: "character-enemy-a.png" },
      { entry: "Tiles/tile_0000.png", output: "platform-tile-a.png" },
      { entry: "Tiles/tile_0010.png", output: "platform-tile-b.png" },
      { entry: "Tiles/tile_0020.png", output: "platform-tile-c.png" },
    ],
  },
  {
    name: "Kenney Mobile Controls",
    author: "Kenney",
    sourceUrl: "https://kenney.nl/assets/mobile-controls",
    downloadUrl:
      "https://kenney.nl/media/pages/assets/mobile-controls/b58fa096c2-1754738457/mobile-controls-1.zip",
    license: "CC0-1.0",
    licenseEntry: "License.txt",
    outputDir: "public/game-studio-assets/cc0/kenney/mobile-controls",
    assets: [
      { entry: "Sprites/Icons/Default/icon_jump.png", output: "icon-jump.png" },
      { entry: "Sprites/Icons/Default/icon_fire.png", output: "icon-fire.png" },
      { entry: "Sprites/Icons/Default/icon_pause.png", output: "icon-pause.png" },
      { entry: "Sprites/Icons/Default/icon_play.png", output: "icon-play.png" },
      { entry: "Sprites/Icons/Default/icon_sound.png", output: "icon-sound.png" },
      { entry: "Sprites/Icons/Default/icon_skull.png", output: "icon-skull.png" },
      { entry: "Sprites/Highlights A/Default/dpad_highlight.png", output: "dpad-highlight.png" },
      {
        entry: "Sprites/Highlights A/Default/button_circle_highlight.png",
        output: "button-circle-highlight.png",
      },
      {
        entry: "Sprites/Highlights A/Default/joystick_circle_pad_highlight.png",
        output: "joystick-pad-highlight.png",
      },
      {
        entry: "Sprites/Highlights A/Default/joystick_circle_nub_highlight.png",
        output: "joystick-nub-highlight.png",
      },
    ],
  },
];

async function main() {
  await fs.mkdir(TMP_DIR, { recursive: true });
  const imported = [];

  for (const pack of PACKS) {
    imported.push(await importZipPack(pack));
  }

  imported.push(...(await importObjktModelPacks()));
  imported.push(...(await importPolyhavenModelPacks()));
  console.log(JSON.stringify(imported, null, 2));
}

async function importZipPack(pack) {
  const zipPath = path.join(TMP_DIR, `${slug(pack.name)}.zip`);
  await download(pack.downloadUrl, zipPath);
  const zipBytes = await fs.readFile(zipPath);
  if (zipBytes.length < 128) {
    throw new Error(`${pack.name} download was unexpectedly small: ${pack.downloadUrl}`);
  }

  const zipSha256 = sha256(zipBytes);
  const entries = listZipEntries(zipPath);
  assertZipEntry(entries, pack.licenseEntry, pack.name);

  const licenseText = readZipEntry(zipPath, pack.licenseEntry).toString("utf8");
  if (!/Creative Commons Zero|CC0/i.test(licenseText)) {
    throw new Error(`${pack.name} license text did not confirm CC0`);
  }

  const outAbs = path.resolve(ROOT, pack.outputDir);
  await fs.mkdir(outAbs, { recursive: true });
  await fs.writeFile(path.join(outAbs, "LICENSE.txt"), `${licenseText.trim()}\n`);

  const existingManifest = await readJson(path.join(outAbs, "SOURCE.json"));
  const assetRecords = [];

  for (const asset of pack.assets) {
    assertZipEntry(entries, asset.entry, pack.name);
    const bytes = readZipEntry(zipPath, asset.entry);
    if (bytes.length > ZIP_ASSET_MAX_BYTES) {
      throw new Error(`${pack.name}:${asset.entry} exceeds the ${ZIP_ASSET_MAX_BYTES} SDK stock asset cap`);
    }
    assertPng(bytes, `${pack.name}:${asset.entry}`);

    const outputPath = path.join(outAbs, asset.output);
    await fs.writeFile(outputPath, bytes);
    assetRecords.push({
      sourceEntry: asset.entry,
      output: asset.output,
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
    });
  }

  const sourceManifest = {
    name: pack.name,
    author: pack.author,
    sourceUrl: pack.sourceUrl,
    downloadUrl: pack.downloadUrl,
    license: pack.license,
    zipSha256,
    importedAt:
      typeof existingManifest?.importedAt === "string"
        ? existingManifest.importedAt
        : new Date().toISOString(),
    assets: assetRecords,
  };

  await fs.writeFile(path.join(outAbs, "SOURCE.json"), JSON.stringify(sourceManifest, null, 2) + "\n");
  return {
    pack: pack.name,
    source: "kenney",
    count: assetRecords.length,
    zipSha256,
  };
}

async function importObjktModelPacks() {
  const imported = [];
  const seen = new Set();

  for (let queryPage = 0; queryPage < OBJKT_MAX_MODEL_QUERIES; queryPage += 1) {
    const offset = queryPage * OBJKT_QUERY_PAGE_SIZE;
    const candidates = await queryObjktModelTokens(offset, OBJKT_QUERY_PAGE_SIZE);

    if (!candidates.length) {
      break;
    }

    for (const candidate of candidates) {
      if (imported.length >= OBJKT_MAX_MODELS_TO_IMPORT) {
        break;
      }

      const candidateKey = `${candidate.fa_contract}:${candidate.token_id}`;
      if (seen.has(candidateKey)) {
        continue;
      }
      seen.add(candidateKey);

      const tokenData = await hydrateObjktTokenData(candidate);
      const openLicense = resolveOpenLicense(tokenData.rightsText, tokenData.metadata);
      if (!openLicense) continue;

      const modelAssets = tokenData.modelAssets.filter((asset) =>
        isModelAsset(asset.mimeType, asset.fileNameHint, asset.url)
      );
      if (!modelAssets.length) continue;

      const outDir = path.join(
        OBJKT_MODELS_ROOT,
        normalizeSegment(candidate.fa_contract),
        normalizeSegment(candidate.token_id)
      );
      const outAbs = path.resolve(ROOT, outDir);
      await fs.mkdir(outAbs, { recursive: true });
      const existingManifest = await readJson(path.join(outAbs, "SOURCE.json"));

      const writtenAssets = [];
      const usedNames = new Set();

      for (const asset of modelAssets) {
        const bytes = await downloadToBuffer(asset.url);
        if (!bytes || !bytes.length) continue;
        if (bytes.length > MODEL_ASSET_MAX_BYTES) continue;

        const filename = uniqueFilename(
          inferModelFilename(asset, tokenData.name, tokenData.artifactUrl, candidate.token_id),
          usedNames
        );
        usedNames.add(filename);

        const outputPath = path.join(outAbs, filename);
        await fs.writeFile(outputPath, bytes);
        writtenAssets.push({
          sourceEntry: filename,
          output: filename,
          sourceUri: asset.url,
          contentType: asset.mimeType || "",
          sizeBytes: bytes.length,
          sha256: sha256(bytes),
          title: inferAssetTitle(tokenData.name, filename),
          kind: "model",
          tags: [...openLicense.tags],
        });
      }

      if (!writtenAssets.length) continue;

      const sourceManifest = {
        name: tokenData.name || `Objkt model ${candidate.token_id}`,
        author: tokenData.author,
        source: "objkt",
        sourceUrl: tokenData.tokenPage,
        downloadUrl: tokenData.metadataUrl || tokenData.artifactUrl || tokenData.tokenPage,
        license: openLicense.license,
        licenseUrl: openLicense.licenseUrl,
        rights: tokenData.rightsText || null,
        importedAt:
          typeof existingManifest?.importedAt === "string"
            ? existingManifest.importedAt
            : new Date().toISOString(),
        assets: writtenAssets,
      };

      await fs.writeFile(path.join(outAbs, "SOURCE.json"), JSON.stringify(sourceManifest, null, 2) + "\n");
      imported.push({
        pack: `${candidate.fa_contract}/${candidate.token_id}`,
        source: "objkt",
        count: writtenAssets.length,
        license: openLicense.license,
      });
    }

    if (imported.length >= OBJKT_MAX_MODELS_TO_IMPORT) {
      break;
    }
    if (candidates.length < OBJKT_QUERY_PAGE_SIZE) {
      break;
    }
  }

  return imported;
}

async function importPolyhavenModelPacks() {
  const imported = [];
  const candidates = await queryPolyhavenModels();

  for (const candidate of candidates) {
    if (imported.length >= POLYHAVEN_MAX_MODELS_TO_IMPORT) break;
    if (!candidate?.assetId) continue;

    const modelData = await hydratePolyhavenModelData(candidate);
    const openLicense = resolveOpenLicense(
      modelData.rightsText,
      modelData.metadata
    );
    if (!openLicense) continue;

    const modelAssets = collectPolyhavenAssets(
      modelData.files,
      POLYHAVEN_PREFERRED_RESOLUTIONS,
      candidate.assetId
    );
    if (!modelAssets.length) continue;

    const outDir = path.join(POLYHAVEN_MODELS_ROOT, normalizeSegment(candidate.assetId));
    const outAbs = path.resolve(ROOT, outDir);
    await fs.mkdir(outAbs, { recursive: true });
    const existingManifest = await readJson(path.join(outAbs, "SOURCE.json"));

    const writtenAssets = [];
    const usedOutputs = new Set();

    for (const [index, asset] of modelAssets.entries()) {
      if (index >= POLYHAVEN_MAX_FILES_PER_CANDIDATE) break;

      const bytes = await downloadToBuffer(asset.url);
      if (!bytes || !bytes.length) continue;
      if (bytes.length > MODEL_ASSET_MAX_BYTES) continue;

      const output = normalizeAssetOutput(
        safeSegment(asset.outputHint || inferFromUri(asset.url))
      );
      if (!output || usedOutputs.has(output)) continue;
      usedOutputs.add(output);

      const outputPath = path.join(outAbs, output);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, bytes);

      writtenAssets.push({
        sourceEntry: output,
        output,
        sourceUri: asset.url,
        contentType: asset.mimeType || "",
        sizeBytes: bytes.length,
        sha256: sha256(bytes),
        title: inferAssetTitle(modelData.name, output),
        kind: "model",
        tags: [...openLicense.tags],
      });
    }

    if (!writtenAssets.length) continue;

    const sourceManifest = {
      name: modelData.name,
      author: modelData.author,
      source: "polyhaven",
      sourceUrl: modelData.modelPageUrl,
      downloadUrl: modelData.sourceMetadata?.filesUrl || modelData.modelPageUrl,
      license: openLicense.license,
      licenseUrl: openLicense.licenseUrl,
      rights: modelData.rightsText || null,
      importedAt:
        typeof existingManifest?.importedAt === "string"
          ? existingManifest.importedAt
          : new Date().toISOString(),
      assets: writtenAssets,
    };

    await fs.writeFile(path.join(outAbs, "SOURCE.json"), JSON.stringify(sourceManifest, null, 2) + "\n");
    imported.push({
      pack: candidate.assetId,
      source: "polyhaven",
      count: writtenAssets.length,
      license: openLicense.license,
    });
  }

  return imported;
}

async function queryPolyhavenModels() {
  const response = await fetchJsonWithTimeout(POLYHAVEN_ASSET_API, {
    headers: {
      "User-Agent": "wtf-game-studio-importer/1.0",
    },
  });

  if (!response) {
    return [];
  }

  const payload = await response;
  if (!payload || typeof payload !== "object") return [];

  const candidates = Object.entries(payload)
    .filter(([, value]) => value && typeof value === "object")
    .map(([assetId, value]) => ({
      assetId,
      name: String(value.name || value.assetId || assetId || "").trim(),
      description: String(value.description || "").trim(),
      authors: value.authors || null,
      download_count: Number(value.download_count || 0),
      metadata: value,
    }))
    .filter((entry) => entry.assetId);

  candidates.sort(
    (a, b) => Number(b.download_count || 0) - Number(a.download_count || 0)
  );

  return candidates.slice(0, POLYHAVEN_MAX_MODELS_TO_IMPORT * 2);
}

async function hydratePolyhavenModelData(candidate) {
  const modelPageUrl = `https://polyhaven.com/a/${candidate.assetId}`;
  const files = await fetchPolyhavenModelFiles(candidate.assetId);
  const metadata = candidate.metadata || {};
  const rightsText = [
    candidate.description,
    candidate.name,
    ...(Array.isArray(metadata.tags) ? metadata.tags : []),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    assetId: candidate.assetId,
    name: candidate.name || candidate.assetId,
    sourceMetadata: metadata,
    author: inferPolyhavenAuthor(metadata),
    modelPageUrl,
    rightsText: String(rightsText || "").trim(),
    metadata,
    files,
  };
}

async function fetchPolyhavenModelFiles(assetId) {
  if (!assetId) return null;
  const response = await fetchJsonWithTimeout(`${POLYHAVEN_FILE_API}/${encodeURIComponent(assetId)}`, {
    headers: {
      "User-Agent": "wtf-game-studio-importer/1.0",
    },
  });

  if (!response) return null;
  return response;
}

function inferPolyhavenAuthor(metadata) {
  const authors = metadata && typeof metadata === "object" && metadata.authors;
  if (!authors || typeof authors !== "object") return "Poly Haven";
  const names = Object.keys(authors).filter(Boolean);
  if (names.length) return names.join(", ");
  return "Poly Haven";
}

function collectPolyhavenAssets(files, preferredResolutionCsv, assetId) {
  if (!files || typeof files !== "object") return [];
  const gltfByRes = files.gltf;
  if (!gltfByRes || typeof gltfByRes !== "object") return [];

  const chosenResolution = selectPolyhavenResolution(
    Object.keys(gltfByRes),
    preferredResolutionCsv
  );
  const chosen = gltfByRes?.[chosenResolution];
  const entry = chosen && typeof chosen === "object" ? chosen.gltf : null;
  if (!entry || typeof entry !== "object") return [];

  const assets = [];
  const mainUrl = String(entry.url || "").trim();
  if (mainUrl && isModelAsset("model/gltf+json", inferFromUri(mainUrl), mainUrl)) {
    assets.push({
      url: mainUrl,
      mimeType: "model/gltf+json",
      outputHint: `${chosenResolution}/${assetId}.gltf`,
    });
  }

  const include = entry.include;
  if (include && typeof include === "object") {
    for (const [fileName, fileMeta] of Object.entries(include)) {
      const fileUrl = String(fileMeta?.url || "").trim();
      if (!fileUrl) continue;
      const normalizedName = String(fileName || inferFromUri(fileUrl)).trim();
      if (!normalizedName) continue;
      const mimeType = inferAssetMimeType(normalizedName);
      if (!isPolyhavenAssetForModelBundle(normalizedName, mimeType)) continue;
      assets.push({
        url: fileUrl,
        mimeType,
        outputHint: `${chosenResolution}/${normalizedName}`,
      });
    }
  }

  return assets;
}

function selectPolyhavenResolution(available, preferredResolutionCsv) {
  const candidates = Array.isArray(available)
    ? available
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (!candidates.length) return "";

  const requested = String(preferredResolutionCsv || "")
    .split(",")
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  for (const target of requested) {
    if (candidates.includes(target)) return target;
  }

  return (
    candidates
      .slice()
      .sort((a, b) => Number(b.replace(/[^\d.]/g, "")) - Number(a.replace(/[^\d.]/g, "")))[0] || ""
  );
}

function safeSegment(value) {
  return String(value || "")
    .trim()
    .replace(/^\.\/+/, "")
    .replace(/^[\\/]+/, "")
    .replace(/\\/g, "/");
}

function normalizeAssetOutput(value) {
  const normalized = safeSegment(value || "");
  const parts = normalized.split("/").map((part) => inferCleanFileName(part));
  const filtered = parts.filter(Boolean).filter((part) => part !== "..");
  return filtered.join("/");
}

function inferAssetMimeType(filename) {
  const ext = path.extname(String(filename || "").toLowerCase());
  if (ext === ".glb") return "model/gltf-binary";
  if (ext === ".gltf") return "model/gltf+json";
  if (ext === ".obj") return "model/obj";
  if (ext === ".mtl") return "model/mtl";
  if (ext === ".bin") return "application/octet-stream";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function isPolyhavenAssetForModelBundle(fileName, mimeType) {
  const ext = path.extname(String(fileName || "").toLowerCase());
  if ([".gltf", ".glb", ".mtl", ".obj", ".bin"].includes(ext)) return true;
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp") return true;
  if (!ext) return false;
  if (String(mimeType || "").toLowerCase() === "model/gltf+json") return true;
  return false;
}

async function queryObjktModelTokens(offset, limit) {
  const query = `query ObjktModelTokens(
    $where: token_bool_exp
    $limit: Int!
    $offset: Int!
    $order: [token_order_by!]
  ) {
    token(where: $where, limit: $limit, offset: $offset, order_by: $order) {
      fa_contract
      token_id
      name
      mime
      artifact_uri
      metadata
      rights
      rights_uri
      creators {
        holder {
          alias
          address
        }
      }
    }
  }`;

  const where = {
    _and: [
      { mime: { _like: "model/%" } },
      {
        _or: [
          { rights: { _is_null: false } },
          { metadata: { _is_null: false } },
        ],
      },
    ],
  };

  const payload = await postObjktGraphql(query, {
    where,
    limit,
    offset,
    order: [{ timestamp: "desc" }],
  });

  return Array.isArray(payload?.data?.token)
    ? payload.data.token
        .map((row) => ({
          fa_contract: String(row?.fa_contract || "").trim(),
          token_id: String(row?.token_id || "").trim(),
          name: String(row?.name || "").trim(),
          mime: String(row?.mime || "").trim(),
          artifact_uri: String(row?.artifact_uri || "").trim(),
          metadata: String(row?.metadata || "").trim(),
          rights: String(row?.rights || "").trim(),
          rights_uri: String(row?.rights_uri || "").trim(),
          creators: Array.isArray(row?.creators)
            ? row.creators
                .map((entry) => ({
                  alias: String(entry?.holder?.alias || "").trim() || null,
                  address: String(entry?.holder?.address || "").trim() || null,
                }))
                .filter((entry) => entry.alias || entry.address)
            : [],
        }))
        .filter((row) => row.fa_contract && row.token_id)
    : [];
}

async function hydrateObjktTokenData(candidate) {
  const tokenPage = `https://objkt.com/tokens/${candidate.fa_contract}/${candidate.token_id}`;
  const artifactUrl = normalizeIpfsToGateway(candidate.artifact_uri)[0] || "";
  const metadata = await fetchObjktMetadata(candidate.metadata);
  const modelAssets = collectModelAssets(candidate, metadata, artifactUrl);

  const rightsText = `${candidate.rights} ${candidate.rights_uri} ${metadata?.rights || ""}`.trim();
  const firstCreator = candidate.creators?.[0];
  const author = String(firstCreator?.alias || firstCreator?.address || "Objkt").trim();

  return {
    fa_contract: candidate.fa_contract,
    token_id: candidate.token_id,
    name: candidate.name,
    mime: candidate.mime,
    artifactUrl,
    metadataUrl: normalizeIpfsToGateway(candidate.metadata)[0] || candidate.metadata,
    metadata,
    rightsText,
    modelAssets,
    author,
    tokenPage,
  };
}

async function fetchObjktMetadata(metadataUri) {
  if (!metadataUri) return null;
  const candidates = normalizeIpfsToGateway(metadataUri);
  for (const candidate of candidates) {
    try {
      const response = await fetchTextWithTimeout(candidate, {
        headers: {
          "User-Agent": "wtf-game-studio-importer/1.0",
        },
      });
      if (!response || !response.ok) continue;
      const text = await response.text();
      if (!text) continue;
      return JSON.parse(text);
    } catch {
      continue;
    }
  }
  return null;
}

function collectModelAssets(candidate, metadata, artifactUrl) {
  const seen = new Set();
  const entries = [];
  const pushEntry = (uri, mimeType, fileNameHint = "") => {
    if (!uri) return;
    const urls = normalizeIpfsToGateway(uri);
    for (const url of urls) {
      const key = `${url}|${String(mimeType || "").toLowerCase()}|${fileNameHint}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ url, mimeType: String(mimeType || "").toLowerCase(), fileNameHint });
      return;
    }
  };

  if (metadata && Array.isArray(metadata.formats)) {
    for (const row of metadata.formats) {
      const uri = String(row?.uri || "").trim();
      const mimeType = String(row?.mimeType || row?.mime_type || row?.mime || "").trim();
      const fileNameHint = String(row?.fileName || "").trim();
      if (!uri) continue;
      if (!isModelAsset(mimeType, fileNameHint, uri)) continue;
      pushEntry(uri, mimeType, fileNameHint);
    }
  }

  if (!entries.length && isModelAsset(candidate.mime, "", candidate.artifact_uri)) {
    pushEntry(artifactUrl || candidate.artifact_uri, candidate.mime);
  }

  return entries;
}

function isModelAsset(mimeType, fileNameHint, uri) {
  const normalizedMime = String(mimeType || "").toLowerCase().trim();
  if (normalizedMime && MODEL_MIME_TYPES.has(normalizedMime)) return true;

  const extension = path.extname(String(fileNameHint || inferFromUri(uri)).toLowerCase());
  if (extension === ".glb" || extension === ".gltf" || extension === ".obj" || extension === ".mtl") {
    return true;
  }

  return false;
}

async function downloadToBuffer(rawUrl) {
  for (const candidate of normalizeIpfsToGateway(rawUrl)) {
    try {
      const response = await fetchWithTimeout(candidate, {
        headers: {
          "User-Agent": "wtf-game-studio-importer/1.0",
        },
      });
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 0) return bytes;
    } catch {
      continue;
    }
  }

  return null;
}

function resolveOpenLicense(rightsText, metadata) {
  const hints = collectLicenseHints(rightsText, metadata);
  if (!hints.length) return null;
  const haystack = hints.join(" ").toLowerCase();
  for (const profile of OPEN_LICENSE_PROFILES) {
    if (profile.matchers.some((matcher) => matcher.test(haystack))) {
      return profile;
    }
  }
  return null;
}

function collectLicenseHints(rightsText, metadata) {
  const hints = [];
  const push = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    hints.push(text);
  };

  push(rightsText);
  if (metadata && typeof metadata === "object") {
    push(metadata.rights);
    push(metadata.rights_uri);
    push(metadata.rightsUri);
    push(metadata.license);
    push(metadata.license_url);
    push(metadata.licenseUri);
    push(metadata.licenseURL);
    if (Array.isArray(metadata.tags)) {
      for (const tag of metadata.tags) push(tag);
    }
  }

  return [...new Set(hints.filter(Boolean))];
}

function inferModelFilename(asset, tokenName, artifactUrl, tokenId) {
  const baseName = inferCleanFileName(asset.fileNameHint || inferFromUri(asset.url) || artifactUrl || "");
  if (baseName) return addModelExtension(baseName, asset.mimeType);
  const fallback = tokenName
    ? `${tokenName} ${tokenId}`
    : `objkt-model-${tokenId}`;
  return addModelExtension(inferCleanFileName(fallback), asset.mimeType);
}

function inferFromUri(uri) {
  const value = String(uri || "").split(/[?#]/)[0].trim();
  if (!value) return "";
  return path.basename(value);
}

function inferAssetTitle(tokenName, filename) {
  const tokenLabel = String(tokenName || "").trim();
  if (tokenLabel) return `${tokenLabel} ${filename}`;
  return filename;
}

function inferCleanFileName(value) {
  const cleaned = String(value || "").trim().replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!cleaned) return "";
  return cleaned.replace(/[\\/?%*:|"<>]/g, "_");
}

function addModelExtension(filename, mimeType) {
  const ext = path.extname(filename);
  if (ext) return filename;
  const normalized = String(mimeType || "").toLowerCase().trim();
  if (normalized === "model/gltf-binary") return `${filename}.glb`;
  if (normalized === "model/gltf+json") return `${filename}.gltf`;
  if (normalized === "model/obj") return `${filename}.obj`;
  if (normalized === "model/mtl") return `${filename}.mtl`;
  return `${filename}.glb`;
}

function uniqueFilename(base, used) {
  const normalized = String(base || "asset").trim() || "asset";
  let candidate = normalized;
  let index = 1;
  while (used.has(candidate)) {
    candidate = `${path.parse(normalized).name}-${index}${path.parse(normalized).ext}`;
    index += 1;
  }
  return candidate;
}

function normalizeSegment(value) {
  return String(value || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "") || "asset";
}

function normalizeIpfsToGateway(rawUri) {
  const value = String(rawUri || "").trim();
  if (!value) return [];
  if (/^ipfs:\/\//i.test(value)) {
    const hash = value
      .replace(/^ipfs:\/\//i, "")
      .replace(/^ipfs\//i, "")
      .replace(/^\/+/, "");
    return OBJKT_IPFS_GATEWAYS.map((gateway) => `${gateway}${hash}`);
  }
  if (/^[a-zA-Z0-9]{46,}$/.test(value)) {
    return OBJKT_IPFS_GATEWAYS.map((gateway) => `${gateway}${value}`);
  }
  return [value];
}

async function download(url, outputPath) {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, bytes);
}

function listZipEntries(zipPath) {
  const result = spawnSync("unzip", ["-Z", "-1", zipPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to inspect ${zipPath}: ${result.stderr || result.stdout}`);
  }
  return new Set(result.stdout.split(/\r?\n/).filter(Boolean));
}

function readZipEntry(zipPath, entry) {
  const result = spawnSync("unzip", ["-p", zipPath, entry], {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 40,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to read ${entry}: ${String(result.stderr || result.stdout)}`);
  }
  return Buffer.from(result.stdout);
}

function assertZipEntry(entries, entry, packName) {
  if (!entries.has(entry)) {
    throw new Error(`${packName} is missing expected ZIP entry: ${entry}`);
  }
}

function assertPng(bytes, label) {
  if (bytes.length < PNG_MAGIC.length || !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error(`${label} is not a PNG file`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function postObjktGraphql(query, variables) {
  const response = await fetchWithTimeout(OBJKT_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "wtf-game-studio-importer/1.0",
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`Objkt GraphQL error ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload?.errors?.length) {
    const first = payload.errors[0];
    throw new Error(`Objkt GraphQL validation error: ${first.message || "unknown"}`);
  }

  return payload;
}

async function fetchWithTimeout(url, init = {}) {
  const normalizedTimeout = Number.isFinite(IMPORT_FETCH_TIMEOUT_MS)
    ? IMPORT_FETCH_TIMEOUT_MS
    : 30_000;
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(normalizedTimeout),
  });
  return response;
}

async function fetchJsonWithTimeout(url, init = {}) {
  try {
    const response = await fetchWithTimeout(url, init);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
 }
}

async function fetchTextWithTimeout(url, init = {}) {
  try {
    const response = await fetchWithTimeout(url, init);
    if (!response.ok) return null;
    return response;
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
