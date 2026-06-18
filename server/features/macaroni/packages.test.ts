import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMacaroniPackageSizePolicy,
  buildPackageCsv,
  buildPackageManifest,
  buildPackageTokenMetadata,
  MACARONI_ARTIFACT_AVERAGE_BYTES,
  MACARONI_ARTIFACT_MAX_BYTES,
  MACARONI_PACKAGE_SCHEMA_VERSION,
  normalizeCheaseDropConfig,
  normalizedFilenameForToken,
  originalTitleFromFilename,
  readinessForPackageItem,
} from "./packages";

const item = {
  tokenId: 1,
  originalFilename: "Moon Salad FINAL 04.png",
  originalTitle: "Moon Salad FINAL 04",
  normalizedFilename: "1.png",
  tokenName: "Moon Salad FINAL 04",
  tokenDescription: "A proper title survives the numbered package filename.",
  mimeType: "image/png",
  sizeBytes: 1024,
  checksumSha256: "a".repeat(64),
  mediaCid: "bafybeifakeartifact",
  metadataCid: "bafybeifakemetadata",
  tags: ["macaroni", "wtfOS"],
  attributes: [{ name: "palette", value: "green" }],
};

test("Macaroni package normalization numbers files but preserves original token titles", () => {
  assert.equal(originalTitleFromFilename("Original Weird Name 01.jpeg", 7), "Original Weird Name 01");
  assert.equal(normalizedFilenameForToken({
    tokenId: 7,
    originalFilename: "Original Weird Name 01.jpeg",
    mimeType: "image/jpeg",
  }), "7.jpeg");
  assert.equal(normalizedFilenameForToken({
    tokenId: 8,
    originalFilename: "no-extension",
    mimeType: "video/mp4",
  }), "8.mp4");
});

test("Macaroni package metadata indexes by original title, not numeric filename", () => {
  const metadata = buildPackageTokenMetadata(item);

  assert.equal(metadata.name, "Moon Salad FINAL 04");
  assert.equal(metadata.title, "Moon Salad FINAL 04");
  assert.equal(metadata.artifactUri, "ipfs://bafybeifakeartifact");
  assert.equal((metadata.macaroni as Record<string, unknown>).normalizedFilename, "1.png");
  assert.equal((metadata.macaroni as Record<string, unknown>).originalFilename, "Moon Salad FINAL 04.png");
  assert.deepEqual(metadata.tags, ["macaroni", "wtfOS"]);
  assert.deepEqual(metadata.attributes, [
    { name: "palette", value: "green" },
    { name: "original_filename", value: "Moon Salad FINAL 04.png" },
  ]);
});

test("Macaroni package CSV exports editable metadata and original filename traits", () => {
  const csv = buildPackageCsv([item]);

  assert.match(csv, /^id,quantity,name,description,tags,original_filename,palette/m);
  assert.match(csv, /1,1,Moon Salad FINAL 04,A proper title survives the numbered package filename\.,macaroni; wtfOS,Moon Salad FINAL 04\.png,green/);
});

test("Macaroni package manifest exposes source package and readiness", () => {
  const manifest = buildPackageManifest({
    id: 42,
    title: "Studio Test",
    description: "Package manifest",
    csvCid: "bafybeiccsv",
    dropConfig: {
      exportTarget: "drop-art",
      layout: "multi-page",
      theme: "editorial",
      headline: "The Big Drop",
      intro: "A package with a page plan.",
      callToAction: "Collect one",
      modules: {
        dropStory: true,
        mintPanel: true,
        tokenGrid: true,
        recentMints: true,
        mintGallery: true,
        leaderboard: true,
        collectionCompletion: true,
      },
    },
  }, [item]);

  assert.equal(manifest.schemaVersion, MACARONI_PACKAGE_SCHEMA_VERSION);
  assert.equal(manifest.packageId, 42);
  assert.equal(manifest.dropConfig.exportTarget, "drop-art");
  assert.equal(manifest.dropConfig.layout, "multi-page");
  assert.equal(manifest.dropConfig.modules.collectionCompletion, true);
  assert.equal(manifest.itemCount, 1);
  assert.equal(manifest.items[0].normalizedFilename, "1.png");
  assert.equal(manifest.items[0].readiness.readyForMint, true);
});

test("CH-EASE drop config normalizes target, layout, text, and module toggles", () => {
  const config = normalizeCheaseDropConfig({
    exportTarget: "objkt",
    layout: "tabbed",
    theme: "dark-room",
    headline: "  Metadata Arcade  ",
    intro: "A platform-neutral package.",
    callToAction: "Preview drop",
    modules: {
      dropStory: false,
      tokenGrid: false,
      mintGallery: false,
      recentMints: true,
      leaderboard: true,
    },
  }, { title: "Fallback title", description: "Fallback intro" });

  assert.equal(config.exportTarget, "objkt");
  assert.equal(config.layout, "tabbed");
  assert.equal(config.theme, "dark-room");
  assert.equal(config.headline, "Metadata Arcade");
  assert.equal(config.modules.dropStory, true);
  assert.equal(config.modules.tokenGrid, true);
  assert.equal(config.modules.leaderboard, true);
});

test("Macaroni package readiness and size policy enforce mintable storage limits", () => {
  assert.equal(readinessForPackageItem(item).readyForMint, true);
  assert.doesNotThrow(() => assertMacaroniPackageSizePolicy([item]));
  assert.throws(
    () => assertMacaroniPackageSizePolicy([{ ...item, sizeBytes: MACARONI_ARTIFACT_MAX_BYTES + 1 }]),
    /1 GB/
  );
  assert.throws(
    () => assertMacaroniPackageSizePolicy([
      { ...item, tokenId: 1, sizeBytes: MACARONI_ARTIFACT_AVERAGE_BYTES + 1 },
      { ...item, tokenId: 2, sizeBytes: MACARONI_ARTIFACT_AVERAGE_BYTES + 1 },
    ]),
    /250 MB/
  );
});
