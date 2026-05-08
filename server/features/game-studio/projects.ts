import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  gameStudioProjectBuilds,
  gameStudioProjects,
} from "@shared/schema";
import { validateConsoleBundleZip } from "../console/bundle-storage";
import {
  buildGameStudioScaffold,
  findGameStudioTemplate,
  type GameStudioTemplate,
} from "./catalog";
import {
  buildGameStudioZip,
  normalizeConsoleSlug,
  normalizeLocalAssets,
  type GameStudioBundleManifest,
  type GameStudioLocalAsset,
} from "./packaging";
import {
  submitArcadeGameFromBundle,
  type ArcadeBundleSubmitInput,
} from "../arcade/catalog";
import type { ConsoleAuthUser, ConsolePublishedGame } from "../console/types";

export type GameStudioProjectFiles = Record<string, string>;

export type GameStudioProjectDTO = {
  id: number;
  ownerUserId: number;
  slug: string;
  title: string;
  description: string;
  templateId: string;
  status: string;
  selectedAssetIds: string[];
  localAssets: GameStudioLocalAsset[];
  files: GameStudioProjectFiles;
  buildMetadata: Record<string, unknown>;
  lastSubmittedGameId: number | null;
  lastBuiltAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GameStudioProjectBuildDTO = {
  id: number;
  projectId: number;
  buildNumber: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  manifest: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
  createdAt: string;
};

export type GameStudioProjectSubmitDTO = {
  game: ConsolePublishedGame;
  project: GameStudioProjectDTO;
  build: GameStudioProjectBuildDTO;
};

export async function listGameStudioProjects(
  ownerUserId: number
): Promise<GameStudioProjectDTO[]> {
  const rows = await db
    .select()
    .from(gameStudioProjects)
    .where(eq(gameStudioProjects.ownerUserId, ownerUserId))
    .orderBy(desc(gameStudioProjects.updatedAt));
  return rows.map(projectRowToDto);
}

export async function getGameStudioProject(
  ownerUserId: number,
  id: number
): Promise<GameStudioProjectDTO | null> {
  const [row] = await db
    .select()
    .from(gameStudioProjects)
    .where(
      and(
        eq(gameStudioProjects.id, id),
        eq(gameStudioProjects.ownerUserId, ownerUserId)
      )
    )
    .limit(1);
  return row ? projectRowToDto(row) : null;
}

export async function createGameStudioProject(input: {
  ownerUserId: number;
  title?: string;
  description?: string;
  templateId?: string;
  selectedAssetIds?: unknown;
  localAssets?: unknown;
  files?: unknown;
}): Promise<GameStudioProjectDTO> {
  const template = requireTemplate(input.templateId);
  const title = normalizeTitle(input.title || template.title);
  const slug = await uniqueProjectSlug(input.ownerUserId, title);
  const scaffold = buildGameStudioScaffold(template.id);
  const selectedAssetIds = normalizeSelectedAssetIds(input.selectedAssetIds);
  const localAssets = normalizeLocalAssets(input.localAssets, { strict: true });

  const [row] = await db
    .insert(gameStudioProjects)
    .values({
      ownerUserId: input.ownerUserId,
      title,
      slug,
      description: normalizeDescription(input.description || template.description),
      templateId: template.id,
      selectedAssetIds,
      localAssets,
      files:
        input.files === undefined
          ? scaffold.files
          : normalizeProjectFiles(input.files),
      buildMetadata: {
        source: "template",
        templateId: template.id,
        assetCount: selectedAssetIds.length + localAssets.length,
      },
      updatedAt: new Date(),
    })
    .returning();
  return projectRowToDto(row);
}

export async function updateGameStudioProject(input: {
  ownerUserId: number;
  id: number;
  title?: string;
  description?: string;
  templateId?: string;
  selectedAssetIds?: unknown;
  localAssets?: unknown;
  files?: unknown;
}): Promise<GameStudioProjectDTO> {
  const current = await getGameStudioProject(input.ownerUserId, input.id);
  if (!current) throw new Error("Game Studio project not found");

  const templateChanged = Boolean(
    input.templateId && input.templateId !== current.templateId
  );
  const template = requireTemplate(input.templateId || current.templateId);
  const scaffold = templateChanged ? buildGameStudioScaffold(template.id).files : null;
  const nextTitle =
    input.title === undefined ? current.title : normalizeTitle(input.title);
  const selectedAssetIds =
    input.selectedAssetIds === undefined
      ? current.selectedAssetIds
      : normalizeSelectedAssetIds(input.selectedAssetIds);
  const localAssets =
    input.localAssets === undefined
      ? current.localAssets
      : normalizeLocalAssets(input.localAssets, { strict: true });

  const [row] = await db
    .update(gameStudioProjects)
    .set({
      title: nextTitle,
      description:
        input.description === undefined
          ? current.description
          : normalizeDescription(input.description),
      templateId: template.id,
      selectedAssetIds,
      localAssets,
      files:
        input.files === undefined
          ? scaffold || current.files
          : normalizeProjectFiles(input.files),
      buildMetadata: {
        ...current.buildMetadata,
        source: "studio-save",
        templateId: template.id,
        assetCount: selectedAssetIds.length + localAssets.length,
        savedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gameStudioProjects.id, input.id),
        eq(gameStudioProjects.ownerUserId, input.ownerUserId)
      )
    )
    .returning();
  return projectRowToDto(row);
}

export async function listGameStudioProjectBuilds(input: {
  ownerUserId: number;
  projectId: number;
  limit?: number;
}): Promise<GameStudioProjectBuildDTO[]> {
  const project = await getGameStudioProject(input.ownerUserId, input.projectId);
  if (!project) throw new Error("Game Studio project not found");
  const rows = await db
    .select()
    .from(gameStudioProjectBuilds)
    .where(eq(gameStudioProjectBuilds.projectId, input.projectId))
    .orderBy(desc(gameStudioProjectBuilds.buildNumber))
    .limit(Math.max(1, Math.min(50, Math.floor(input.limit ?? 10))));
  return rows.map(buildRowToDto);
}

export async function buildGameStudioProjectBundle(input: {
  ownerUserId: number;
  id: number;
}): Promise<{
  filename: string;
  mimeType: "application/zip";
  sizeBytes: number;
  fileData: string;
  manifest: GameStudioBundleManifest;
  build: GameStudioProjectBuildDTO;
  project: GameStudioProjectDTO;
}> {
  const project = await getGameStudioProject(input.ownerUserId, input.id);
  if (!project) throw new Error("Game Studio project not found");
  const template = requireTemplate(project.templateId);
  const { zip, manifest } = buildGameStudioZip({
    title: project.title,
    slug: project.slug,
    template,
    files: project.files,
    selectedAssetIds: project.selectedAssetIds,
    localAssets: project.localAssets,
  });
  const validation = validateConsoleBundleZip(zip);
  if (!validation.ok) {
    throw new Error(`Game Studio build failed console validation: ${validation.errors.join(", ")}`);
  }
  const [lastBuild] = await db
    .select({ buildNumber: gameStudioProjectBuilds.buildNumber })
    .from(gameStudioProjectBuilds)
    .where(eq(gameStudioProjectBuilds.projectId, project.id))
    .orderBy(desc(gameStudioProjectBuilds.buildNumber))
    .limit(1);
  const buildNumber = (lastBuild?.buildNumber ?? 0) + 1;
  const checksumSha256 = createHash("sha256").update(zip).digest("hex");
  const filename = `${project.slug}-build-${buildNumber}.zip`;
  const [buildRow] = await db
    .insert(gameStudioProjectBuilds)
    .values({
      projectId: project.id,
      buildNumber,
      filename,
      mimeType: "application/zip",
      sizeBytes: zip.length,
      checksumSha256,
      manifestJson: manifest,
      sourceSnapshot: {
        title: project.title,
        slug: project.slug,
        templateId: project.templateId,
        selectedAssetIds: project.selectedAssetIds,
        localAssets: project.localAssets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          size: asset.size,
          type: asset.type,
        })),
        files: project.files,
        validation: {
          totalUncompressedBytes: validation.totalUncompressedBytes,
          fileCount: validation.files.length,
        },
      },
    })
    .returning();

  const [row] = await db
    .update(gameStudioProjects)
    .set({
      lastBuiltAt: new Date(),
      buildMetadata: {
        ...project.buildMetadata,
        lastBuild: {
          buildNumber,
          sizeBytes: zip.length,
          fileCount: manifest.files.length,
          checksumSha256,
          builtAt: manifest.builtAt,
        },
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gameStudioProjects.id, input.id),
        eq(gameStudioProjects.ownerUserId, input.ownerUserId)
      )
    )
    .returning();

  return {
    filename,
    mimeType: "application/zip",
    sizeBytes: zip.length,
    fileData: `data:application/zip;base64,${zip.toString("base64")}`,
    manifest,
    build: buildRowToDto(buildRow),
    project: projectRowToDto(row),
  };
}

export async function submitGameStudioProjectToArcade(input: {
  ownerUserId: number;
  id: number;
  user: ConsoleAuthUser;
  updateSlug?: string;
  title?: string;
  description?: string;
  category?: string;
  coverUri?: string | null;
  maxPossibleScore?: number | null;
  maxScorePerSecond?: number | null;
}): Promise<GameStudioProjectSubmitDTO> {
  const built = await buildGameStudioProjectBundle({
    ownerUserId: input.ownerUserId,
    id: input.id,
  });
  const template = requireTemplate(built.project.templateId);
  const zipBytes = Buffer.from(built.fileData.split(",")[1] || "", "base64");
  const arcadeInput: ArcadeBundleSubmitInput = {
    zipBytes,
    updateSlug: input.updateSlug,
    title: input.title || built.project.title,
    description: input.description ?? built.project.description,
    category: input.category || template.genre,
    coverUri: input.coverUri,
    maxPossibleScore: input.maxPossibleScore ?? 1_000_000,
    maxScorePerSecond: input.maxScorePerSecond ?? 5_000,
    bundleMetadata: {
      source: "game_studio_project",
      targetSurface: "arcade",
      projectId: built.project.id,
      projectSlug: built.project.slug,
      buildId: built.build.id,
      buildNumber: built.build.buildNumber,
      checksumSha256: built.build.checksumSha256,
      manifest: built.manifest,
      sourceSnapshot: built.build.sourceSnapshot,
    },
  };
  const game = await submitArcadeGameFromBundle(input.user, arcadeInput);

  const [row] = await db
    .update(gameStudioProjects)
    .set({
      status: game.status === "active" ? "published" : "submitted",
      lastSubmittedGameId: game.id,
      buildMetadata: {
        ...built.project.buildMetadata,
        lastSubmission: {
          arcadeGameId: game.id,
          arcadeSlug: game.slug,
          arcadeStatus: game.status,
          targetSurface: "arcade",
          updateSlug: input.updateSlug || null,
          buildId: built.build.id,
          buildNumber: built.build.buildNumber,
          checksumSha256: built.build.checksumSha256,
          submittedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gameStudioProjects.id, built.project.id),
        eq(gameStudioProjects.ownerUserId, input.ownerUserId)
      )
    )
    .returning();

  return {
    game,
    project: projectRowToDto(row),
    build: built.build,
  };
}

function projectRowToDto(
  row: typeof gameStudioProjects.$inferSelect
): GameStudioProjectDTO {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    slug: row.slug,
    title: row.title,
    description: row.description || "",
    templateId: row.templateId,
    status: row.status,
    selectedAssetIds: normalizeSelectedAssetIds(row.selectedAssetIds),
    localAssets: normalizeLocalAssets(row.localAssets),
    files: normalizeProjectFiles(row.files),
    buildMetadata: normalizeObject(row.buildMetadata),
    lastSubmittedGameId: row.lastSubmittedGameId ?? null,
    lastBuiltAt: row.lastBuiltAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildRowToDto(
  row: typeof gameStudioProjectBuilds.$inferSelect
): GameStudioProjectBuildDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    buildNumber: row.buildNumber,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    manifest: normalizeObject(row.manifestJson),
    sourceSnapshot: normalizeObject(row.sourceSnapshot),
    createdAt: row.createdAt.toISOString(),
  };
}

function requireTemplate(templateId: string | undefined): GameStudioTemplate {
  const template = findGameStudioTemplate(String(templateId || "")) || findGameStudioTemplate("endless-runner");
  if (!template) throw new Error("Game Studio template not found");
  return template;
}

function normalizeTitle(value: string | undefined): string {
  const title = String(value || "").trim().slice(0, 200);
  if (!title) throw new Error("Project title is required");
  return title;
}

function normalizeDescription(value: string | undefined): string {
  return String(value || "").trim().slice(0, 2000);
}

function normalizeSelectedAssetIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 100)
    )
  );
}

export function normalizeProjectFiles(input: unknown): GameStudioProjectFiles {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).flatMap(([path, value]) => {
      if (typeof value !== "string") return [];
      const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").slice(0, 240);
      if (!normalized || normalized.includes("../") || normalized.startsWith("..")) {
        return [];
      }
      if (!/\.(html|css|js|mjs|json|txt|md|svg)$/i.test(normalized)) return [];
      return [[normalized, value.slice(0, 1_000_000)]];
    })
  );
}

function normalizeObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

async function uniqueProjectSlug(ownerUserId: number, title: string): Promise<string> {
  const base = normalizeConsoleSlug(title);
  for (let i = 0; i < 50; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [existing] = await db
      .select({ id: gameStudioProjects.id })
      .from(gameStudioProjects)
      .where(
        and(
          eq(gameStudioProjects.ownerUserId, ownerUserId),
          eq(gameStudioProjects.slug, slug)
        )
      )
      .limit(1);
    if (!existing) return slug;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 140);
}
