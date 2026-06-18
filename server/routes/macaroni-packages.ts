import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { requirePermission } from "../auth/passport";
import { db } from "../db";
import { macaroniPackageItems, macaroniPackages } from "@shared/schema";
import {
  assertMacaroniPackageSizePolicy,
  buildPackageCsv,
  buildPackageManifest,
  buildPackageTokenMetadata,
  CHEASE_DROP_LAYOUTS,
  CHEASE_DROP_MODULES,
  CHEASE_EXPORT_TARGETS,
  MACARONI_ARTIFACT_MAX_BYTES,
  MACARONI_PACKAGE_SCHEMA_VERSION,
  MACARONI_PACKAGE_SOURCE,
  normalizeCheaseDropConfig,
  normalizeAttributes,
  normalizedFilenameForToken,
  normalizeTags,
  originalTitleFromFilename,
  readinessForPackageItem,
  sha256Buffer,
  summarizePackageItems,
  type MacaroniPackageItemLike,
} from "../features/macaroni/packages";
import { stageAndPinUpload } from "../features/ipfs-pinning/service";
import { ingestSystemEvent } from "../challenges/events/ingest";

const router = Router();
const MEBIBYTE_BYTES = 1024 * 1024;
const DEFAULT_IPFS_MAX_BYTES = 1024 * MEBIBYTE_BYTES;

const createPackageSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
});

const updateItemSchema = z.object({
  name: z.string().trim().max(300).optional(),
  title: z.string().trim().max(300).optional(),
  tokenName: z.string().trim().max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  tokenDescription: z.string().trim().max(5000).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  attributes: z.array(z.object({
    name: z.string(),
    value: z.unknown(),
  })).optional(),
});

const updatePackageConfigSchema = z.object({
  exportTarget: z.string().optional(),
  layout: z.string().optional(),
  theme: z.string().optional(),
  headline: z.string().trim().max(120).optional(),
  intro: z.string().trim().max(500).optional(),
  callToAction: z.string().trim().max(60).optional(),
  modules: z.record(z.string(), z.boolean()).optional(),
});

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function macaroniIpfsMaxBytes(): number {
  return envInt("MACARONI_IPFS_MAX_BYTES", DEFAULT_IPFS_MAX_BYTES);
}

function uploadLimitLabel(bytes: number): string {
  const gb = bytes / (1024 * MEBIBYTE_BYTES);
  if (Number.isInteger(gb) && gb >= 1) return `${gb} GB`;
  const mb = bytes / MEBIBYTE_BYTES;
  return Number.isInteger(mb) ? `${mb} MB` : `${bytes} bytes`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: macaroniIpfsMaxBytes(),
    files: 1,
    fields: 8,
    fieldSize: 1024 * 1024,
  },
});

function runPinUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const message =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? `File exceeds the ${uploadLimitLabel(macaroniIpfsMaxBytes())} Macaroni IPFS upload limit`
        : "Invalid Macaroni IPFS upload";
    return res.status(400).json({ error: message });
  });
}

function routeInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializePackage(pkg: typeof macaroniPackages.$inferSelect) {
  return {
    id: pkg.id,
    title: pkg.title,
    description: pkg.description,
    schemaVersion: pkg.schemaVersion,
    status: pkg.status,
    itemCount: pkg.itemCount,
    totalBytes: pkg.totalBytes,
    averageBytes: pkg.averageBytes,
    csvCid: pkg.csvCid,
    manifestCid: pkg.manifestCid,
    dropConfig: normalizeCheaseDropConfig(pkg.dropConfig, pkg),
    finalizedAt: iso(pkg.finalizedAt),
    createdAt: iso(pkg.createdAt),
    updatedAt: iso(pkg.updatedAt),
  };
}

function serializePackageItem(item: typeof macaroniPackageItems.$inferSelect) {
  const itemLike = itemAsLike(item);
  const readiness = readinessForPackageItem(itemLike);
  return {
    id: item.id,
    packageId: item.packageId,
    tokenId: item.tokenId,
    originalFilename: item.originalFilename,
    originalTitle: item.originalTitle,
    normalizedFilename: item.normalizedFilename,
    tokenName: item.tokenName,
    tokenDescription: item.tokenDescription,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    checksumSha256: item.checksumSha256,
    mediaCid: item.mediaCid,
    mediaJobId: item.mediaJobId,
    metadataCid: item.metadataCid,
    metadataJobId: item.metadataJobId,
    tags: normalizeTags(item.tags),
    attributes: normalizeAttributes(item.attributes),
    metadataJson: item.metadataJson,
    readiness,
    status: readiness.readyForMint ? "ready" : item.status,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  };
}

function itemAsLike(item: typeof macaroniPackageItems.$inferSelect): MacaroniPackageItemLike {
  return {
    id: item.id,
    tokenId: item.tokenId,
    originalFilename: item.originalFilename,
    originalTitle: item.originalTitle,
    normalizedFilename: item.normalizedFilename,
    tokenName: item.tokenName,
    tokenDescription: item.tokenDescription,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    checksumSha256: item.checksumSha256,
    mediaCid: item.mediaCid,
    metadataCid: item.metadataCid,
    tags: normalizeTags(item.tags),
    attributes: normalizeAttributes(item.attributes),
  };
}

async function getOwnedPackage(userId: number, packageId: number) {
  const [pkg] = await db
    .select()
    .from(macaroniPackages)
    .where(and(eq(macaroniPackages.id, packageId), eq(macaroniPackages.ownerUserId, userId)))
    .limit(1);
  return pkg ?? null;
}

async function listPackageItems(packageId: number) {
  return db
    .select()
    .from(macaroniPackageItems)
    .where(eq(macaroniPackageItems.packageId, packageId))
    .orderBy(asc(macaroniPackageItems.tokenId));
}

async function recalcPackageStats(packageId: number) {
  const items = await listPackageItems(packageId);
  const summary = summarizePackageItems(items.map(itemAsLike));
  const [pkg] = await db
    .update(macaroniPackages)
    .set({
      itemCount: summary.itemCount,
      totalBytes: summary.totalBytes,
      averageBytes: summary.averageBytes,
      updatedAt: new Date(),
    })
    .where(eq(macaroniPackages.id, packageId))
    .returning();
  return pkg;
}

async function markPackageDraft(packageId: number) {
  await db
    .update(macaroniPackages)
    .set({
      status: "draft",
      csvText: null,
      csvCid: null,
      csvJobId: null,
      manifestJson: {},
      manifestCid: null,
      manifestJobId: null,
      finalizedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(macaroniPackages.id, packageId));
}

async function nextPackageTokenId(packageId: number): Promise<number> {
  const [last] = await db
    .select({ tokenId: macaroniPackageItems.tokenId })
    .from(macaroniPackageItems)
    .where(eq(macaroniPackageItems.packageId, packageId))
    .orderBy(desc(macaroniPackageItems.tokenId))
    .limit(1);
  return (last?.tokenId ?? 0) + 1;
}

async function pinPackageMetadata(input: {
  userId: number;
  packageId: number;
  item: MacaroniPackageItemLike;
}) {
  const metadata = buildPackageTokenMetadata(input.item);
  const buffer = Buffer.from(JSON.stringify(metadata, null, 2));
  const pinned = await stageAndPinUpload({
    userId: input.userId,
    fileName: `${input.item.tokenId}.json`,
    mimeType: "application/json",
    buffer,
    source: MACARONI_PACKAGE_SOURCE,
    scopeType: "macaroni_drop",
    scopeRef: `macaroni-package:${input.packageId}:token:${input.item.tokenId}:metadata`,
  });
  return { metadata, pinned };
}

function emitMacaroniPackageEvent(input: {
  eventType: string;
  userId: number;
  packageId: number;
  itemId?: number;
  tokenId?: number;
  metadata?: Record<string, unknown>;
}) {
  void ingestSystemEvent({
    eventId: `${input.eventType}:${input.userId}:${input.packageId}:${input.itemId ?? "package"}:${Date.now()}`,
    eventType: input.eventType,
    userId: input.userId,
    source: "macaroni",
    sourceModule: "macaroni-packager",
    rawRefType: input.itemId ? "macaroni_package_item" : "macaroni_package",
    rawRefId: input.itemId ?? input.packageId,
    metadata: {
      packageId: input.packageId,
      ...(input.itemId ? { itemId: input.itemId } : {}),
      ...(input.tokenId ? { tokenId: input.tokenId } : {}),
      ...(input.metadata ?? {}),
    },
  }).catch((err) => console.warn(`[macaroni-packages] failed to emit ${input.eventType}`, err));
}

router.get(
  "/api/macaroni/packages",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      const packages = await db
        .select()
        .from(macaroniPackages)
        .where(eq(macaroniPackages.ownerUserId, user.id))
        .orderBy(desc(macaroniPackages.updatedAt))
        .limit(50);
      return res.json({
        packages: packages.map(serializePackage),
        schemaVersion: MACARONI_PACKAGE_SCHEMA_VERSION,
      });
    } catch (err) {
      console.error("[macaroni-packages] list failed:", err);
      return res.status(500).json({ error: "Failed to list Macaroni packages" });
    }
  }
);

router.post(
  "/api/macaroni/packages",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    const parsed = createPackageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid Macaroni package payload" });
    }
    try {
      const user = req.user as { id: number };
      const [pkg] = await db
        .insert(macaroniPackages)
        .values({
          ownerUserId: user.id,
          title: parsed.data.title || "Macaroni Package",
          description: parsed.data.description || "",
          schemaVersion: MACARONI_PACKAGE_SCHEMA_VERSION,
          dropConfig: normalizeCheaseDropConfig(null, {
            title: parsed.data.title || "Macaroni Package",
            description: parsed.data.description || "",
          }),
        })
        .returning();
      emitMacaroniPackageEvent({
        eventType: "macaroni.package_created",
        userId: user.id,
        packageId: pkg.id,
        metadata: {
          title: pkg.title,
          schemaVersion: pkg.schemaVersion,
        },
      });
      return res.status(201).json({ package: serializePackage(pkg), items: [] });
    } catch (err) {
      console.error("[macaroni-packages] create failed:", err);
      return res.status(500).json({ error: "Failed to create Macaroni package" });
    }
  }
);

router.patch(
  "/api/macaroni/packages/:packageId/config",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    const packageId = routeInt(req.params.packageId);
    if (!packageId) return res.status(400).json({ error: "Invalid package id" });
    const parsed = updatePackageConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid CH-EASE package config payload" });
    try {
      const user = req.user as { id: number };
      const pkg = await getOwnedPackage(user.id, packageId);
      if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
      const dropConfig = normalizeCheaseDropConfig(parsed.data, pkg);
      const [updatedPackage] = await db
        .update(macaroniPackages)
        .set({
          dropConfig,
          status: "draft",
          csvText: null,
          csvCid: null,
          csvJobId: null,
          manifestJson: {},
          manifestCid: null,
          manifestJobId: null,
          finalizedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(macaroniPackages.id, pkg.id))
        .returning();
      const items = await listPackageItems(pkg.id);
      emitMacaroniPackageEvent({
        eventType: "macaroni.package_drop_config_updated",
        userId: user.id,
        packageId: pkg.id,
        metadata: {
          exportTarget: dropConfig.exportTarget,
          layout: dropConfig.layout,
          enabledModules: CHEASE_DROP_MODULES.filter((moduleKey) => dropConfig.modules[moduleKey]),
          supportedTargets: CHEASE_EXPORT_TARGETS,
          supportedLayouts: CHEASE_DROP_LAYOUTS,
        },
      });
      return res.json({
        package: serializePackage(updatedPackage),
        items: items.map(serializePackageItem),
      });
    } catch (err) {
      console.error("[macaroni-packages] config update failed:", err);
      return res.status(500).json({ error: "Failed to update CH-EASE package config" });
    }
  }
);

router.get(
  "/api/macaroni/packages/:packageId",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    const packageId = routeInt(req.params.packageId);
    if (!packageId) return res.status(400).json({ error: "Invalid package id" });
    try {
      const user = req.user as { id: number };
      const pkg = await getOwnedPackage(user.id, packageId);
      if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
      const items = await listPackageItems(pkg.id);
      return res.json({
        package: serializePackage(pkg),
        items: items.map(serializePackageItem),
      });
    } catch (err) {
      console.error("[macaroni-packages] detail failed:", err);
      return res.status(500).json({ error: "Failed to load Macaroni package" });
    }
  }
);

router.post(
  "/api/macaroni/packages/:packageId/items",
  requirePermission("trusted_market_creator"),
  runPinUpload,
  async (req, res) => {
    const packageId = routeInt(req.params.packageId);
    if (!packageId) return res.status(400).json({ error: "Invalid package id" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Upload a media file" });
    if (file.size > MACARONI_ARTIFACT_MAX_BYTES) {
      return res.status(400).json({ error: "Macaroni token artifacts cannot exceed 1 GB" });
    }

    try {
      const user = req.user as { id: number };
      const pkg = await getOwnedPackage(user.id, packageId);
      if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });

      const tokenId = await nextPackageTokenId(pkg.id);
      const originalFilename = file.originalname || `token-${tokenId}`;
      const originalTitle = originalTitleFromFilename(originalFilename, tokenId);
      const mimeType = file.mimetype || "application/octet-stream";
      const normalizedFilename = normalizedFilenameForToken({
        tokenId,
        originalFilename,
        mimeType,
      });
      const checksumSha256 = sha256Buffer(file.buffer);
      const mediaPin = await stageAndPinUpload({
        userId: user.id,
        fileName: normalizedFilename,
        mimeType,
        buffer: file.buffer,
        source: MACARONI_PACKAGE_SOURCE,
        scopeType: "macaroni_drop",
        scopeRef: `macaroni-package:${pkg.id}:token:${tokenId}:media`,
      });
      const draftItem: MacaroniPackageItemLike = {
        tokenId,
        originalFilename,
        originalTitle,
        normalizedFilename,
        tokenName: originalTitle,
        tokenDescription: "",
        mimeType,
        sizeBytes: file.size,
        checksumSha256,
        mediaCid: mediaPin.cid,
        tags: [],
        attributes: [],
      };
      const { metadata, pinned: metadataPin } = await pinPackageMetadata({
        userId: user.id,
        packageId: pkg.id,
        item: draftItem,
      });
      const itemForStatus = {
        ...draftItem,
        metadataCid: metadataPin.cid,
      };
      const readiness = readinessForPackageItem(itemForStatus);
      const [item] = await db
        .insert(macaroniPackageItems)
        .values({
          packageId: pkg.id,
          tokenId,
          originalFilename,
          originalTitle,
          normalizedFilename,
          tokenName: originalTitle,
          tokenDescription: "",
          mimeType,
          sizeBytes: file.size,
          checksumSha256,
          mediaCid: mediaPin.cid,
          mediaJobId: mediaPin.jobId,
          metadataCid: metadataPin.cid,
          metadataJobId: metadataPin.jobId,
          tags: [],
          attributes: [],
          metadataJson: metadata,
          readiness,
          status: readiness.readyForMint ? "ready" : "needs_metadata",
        })
        .returning();
      await markPackageDraft(pkg.id);
      const updatedPackage = await recalcPackageStats(pkg.id);
      const fullItems = await listPackageItems(pkg.id);
      emitMacaroniPackageEvent({
        eventType: "macaroni.package_item_uploaded",
        userId: user.id,
        packageId: pkg.id,
        itemId: item.id,
        tokenId,
        metadata: {
          originalFilename,
          originalTitle,
          normalizedFilename,
          mimeType,
          sizeBytes: file.size,
          mediaCid: mediaPin.cid,
          metadataCid: metadataPin.cid,
          readyForMint: readiness.readyForMint,
        },
      });
      return res.status(201).json({
        package: updatedPackage ? serializePackage(updatedPackage) : serializePackage(pkg),
        item: serializePackageItem(item),
        items: fullItems.map(serializePackageItem),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload Macaroni package item";
      console.error("[macaroni-packages] upload failed:", err);
      return res.status((err as { status?: number })?.status ?? 503).json({
        error: message,
        code: (err as { code?: string })?.code,
      });
    }
  }
);

router.patch(
  "/api/macaroni/packages/:packageId/items/:itemId",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    const packageId = routeInt(req.params.packageId);
    const itemId = routeInt(req.params.itemId);
    if (!packageId || !itemId) return res.status(400).json({ error: "Invalid package item id" });
    const parsed = updateItemSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid token metadata payload" });

    try {
      const user = req.user as { id: number };
      const pkg = await getOwnedPackage(user.id, packageId);
      if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
      const [existing] = await db
        .select()
        .from(macaroniPackageItems)
        .where(and(eq(macaroniPackageItems.id, itemId), eq(macaroniPackageItems.packageId, pkg.id)))
        .limit(1);
      if (!existing) return res.status(404).json({ error: "Macaroni package item not found" });

      const tokenName =
        parsed.data.tokenName ||
        parsed.data.name ||
        parsed.data.title ||
        existing.tokenName;
      const tokenDescription =
        parsed.data.tokenDescription ??
        parsed.data.description ??
        existing.tokenDescription;
      const tags = parsed.data.tags === undefined ? normalizeTags(existing.tags) : normalizeTags(parsed.data.tags);
      const attributes = parsed.data.attributes === undefined
        ? normalizeAttributes(existing.attributes)
        : normalizeAttributes(parsed.data.attributes);
      const itemLike: MacaroniPackageItemLike = {
        ...itemAsLike(existing),
        tokenName,
        tokenDescription,
        tags,
        attributes,
      };
      const { metadata, pinned } = await pinPackageMetadata({
        userId: user.id,
        packageId: pkg.id,
        item: itemLike,
      });
      const readiness = readinessForPackageItem({ ...itemLike, metadataCid: pinned.cid });
      const [item] = await db
        .update(macaroniPackageItems)
        .set({
          tokenName,
          tokenDescription,
          tags,
          attributes,
          metadataCid: pinned.cid,
          metadataJobId: pinned.jobId,
          metadataJson: metadata,
          readiness,
          status: readiness.readyForMint ? "ready" : "needs_metadata",
          updatedAt: new Date(),
        })
        .where(eq(macaroniPackageItems.id, existing.id))
        .returning();
      await markPackageDraft(pkg.id);
      const updatedPackage = await recalcPackageStats(pkg.id);
      const fullItems = await listPackageItems(pkg.id);
      emitMacaroniPackageEvent({
        eventType: "macaroni.package_metadata_updated",
        userId: user.id,
        packageId: pkg.id,
        itemId: item.id,
        tokenId: item.tokenId,
        metadata: {
          tokenName: item.tokenName,
          metadataCid: item.metadataCid,
          readyForMint: readiness.readyForMint,
          warningCount: readiness.warnings.length,
          tagCount: normalizeTags(item.tags).length,
          attributeCount: normalizeAttributes(item.attributes).length,
        },
      });
      return res.json({
        package: updatedPackage ? serializePackage(updatedPackage) : serializePackage(pkg),
        item: serializePackageItem(item),
        items: fullItems.map(serializePackageItem),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update Macaroni token metadata";
      console.error("[macaroni-packages] update item failed:", err);
      return res.status((err as { status?: number })?.status ?? 503).json({
        error: message,
        code: (err as { code?: string })?.code,
      });
    }
  }
);

router.post(
  "/api/macaroni/packages/:packageId/finalize",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    const packageId = routeInt(req.params.packageId);
    if (!packageId) return res.status(400).json({ error: "Invalid package id" });
    try {
      const user = req.user as { id: number };
      const pkg = await getOwnedPackage(user.id, packageId);
      if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
      const items = (await listPackageItems(pkg.id)).map(itemAsLike);
      if (!items.length) return res.status(400).json({ error: "Upload media before finalizing this package" });
      const incomplete = items
        .map((item) => ({ item, readiness: readinessForPackageItem(item) }))
        .filter(({ readiness }) => !readiness.readyForMint);
      if (incomplete.length) {
        return res.status(400).json({
          error: `${incomplete.length} token(s) are not ready for mint`,
          items: incomplete.map(({ item, readiness }) => ({
            tokenId: item.tokenId,
            warnings: readiness.warnings,
          })),
        });
      }
      const summary = assertMacaroniPackageSizePolicy(items);
      const csvText = buildPackageCsv(items);
      const csvPin = await stageAndPinUpload({
        userId: user.id,
        fileName: `macaroni-package-${pkg.id}.csv`,
        mimeType: "text/csv",
        buffer: Buffer.from(csvText),
        source: MACARONI_PACKAGE_SOURCE,
        scopeType: "macaroni_drop",
        scopeRef: `macaroni-package:${pkg.id}:csv`,
      });
      const manifestDraft = buildPackageManifest({ ...pkg, csvCid: csvPin.cid }, items);
      const manifestPin = await stageAndPinUpload({
        userId: user.id,
        fileName: `macaroni-package-${pkg.id}.manifest.json`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(manifestDraft, null, 2)),
        source: MACARONI_PACKAGE_SOURCE,
        scopeType: "macaroni_drop",
        scopeRef: `macaroni-package:${pkg.id}:manifest`,
      });
      const manifest = {
        ...manifestDraft,
        manifestCid: manifestPin.cid,
      };
      const [updatedPackage] = await db
        .update(macaroniPackages)
        .set({
          status: "finalized",
          itemCount: summary.itemCount,
          totalBytes: summary.totalBytes,
          averageBytes: summary.averageBytes,
          csvText,
          csvCid: csvPin.cid,
          csvJobId: csvPin.jobId,
          manifestJson: manifest,
          manifestCid: manifestPin.cid,
          manifestJobId: manifestPin.jobId,
          finalizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(macaroniPackages.id, pkg.id))
        .returning();
      const fullItems = await listPackageItems(pkg.id);
      emitMacaroniPackageEvent({
        eventType: "macaroni.package_finalized",
        userId: user.id,
        packageId: pkg.id,
        metadata: {
          itemCount: summary.itemCount,
          totalBytes: summary.totalBytes,
          averageBytes: summary.averageBytes,
          csvCid: csvPin.cid,
          manifestCid: manifestPin.cid,
          exportTarget: normalizeCheaseDropConfig(pkg.dropConfig, pkg).exportTarget,
        },
      });
      return res.json({
        package: serializePackage(updatedPackage),
        items: fullItems.map(serializePackageItem),
        csv: {
          cid: csvPin.cid,
          ipfsUri: csvPin.ipfsUri,
        },
        manifest: {
          cid: manifestPin.cid,
          ipfsUri: manifestPin.ipfsUri,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to finalize Macaroni package";
      console.error("[macaroni-packages] finalize failed:", err);
      return res.status((err as { status?: number })?.status ?? 503).json({
        error: message,
        code: (err as { code?: string })?.code,
      });
    }
  }
);

router.get(
  "/api/macaroni/packages/:packageId/export.csv",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    const packageId = routeInt(req.params.packageId);
    if (!packageId) return res.status(400).json({ error: "Invalid package id" });
    try {
      const user = req.user as { id: number };
      const pkg = await getOwnedPackage(user.id, packageId);
      if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
      const csvText = pkg.csvText || buildPackageCsv((await listPackageItems(pkg.id)).map(itemAsLike));
      emitMacaroniPackageEvent({
        eventType: "macaroni.package_csv_downloaded",
        userId: user.id,
        packageId: pkg.id,
        metadata: {
          itemCount: pkg.itemCount,
          csvCid: pkg.csvCid,
          csvBytes: Buffer.byteLength(csvText),
        },
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="macaroni-package-${pkg.id}.csv"`);
      return res.send(csvText);
    } catch (err) {
      console.error("[macaroni-packages] csv export failed:", err);
      return res.status(500).json({ error: "Failed to export Macaroni package CSV" });
    }
  }
);

router.get(
  "/api/macaroni/packages/:packageId/source",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    const packageId = routeInt(req.params.packageId);
    if (!packageId) return res.status(400).json({ error: "Invalid package id" });
    try {
      const user = req.user as { id: number };
      const pkg = await getOwnedPackage(user.id, packageId);
      if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
      if (pkg.status !== "finalized") {
        return res.status(409).json({ error: "Finalize the Macaroni package before loading it as a mint source" });
      }
      const items = await listPackageItems(pkg.id);
      emitMacaroniPackageEvent({
        eventType: "macaroni.package_source_loaded",
        userId: user.id,
        packageId: pkg.id,
        metadata: {
          itemCount: items.length,
          csvCid: pkg.csvCid,
          manifestCid: pkg.manifestCid,
          destination: "macaroni-studio",
        },
      });
      return res.json({
        source: "wtfos-macaroni-package",
        package: serializePackage(pkg),
        dropConfig: normalizeCheaseDropConfig(pkg.dropConfig, pkg),
        tokens: items.map((item) => ({
          id: item.tokenId,
          quantity: 1,
          name: item.tokenName || item.originalTitle,
          title: item.tokenName || item.originalTitle,
          description: item.tokenDescription || "",
          tags: normalizeTags(item.tags),
          attributes: normalizeAttributes(item.attributes),
          fileName: item.normalizedFilename,
          mediaBytes: item.sizeBytes,
          mediaCid: item.mediaCid,
          mediaMime: item.mimeType,
          metadataCid: item.metadataCid || "",
        })),
      });
    } catch (err) {
      console.error("[macaroni-packages] source failed:", err);
      return res.status(500).json({ error: "Failed to load Macaroni package source" });
    }
  }
);

export default router;
