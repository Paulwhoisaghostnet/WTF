import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { getSessionSecret } from "../auth/session-secret";
import {
  claimUserSite,
  getUserSiteState,
  publishUserSite,
  saveUserSitePage,
  WtfUserSiteError,
} from "../features/wtf-sites/service";
import {
  normalizeUserSiteSlug,
} from "../features/wtf-sites/policy";
import { WTF_USER_SITE_HOME_SLUG } from "@shared/wtf-user-sites";
import {
  buildMacaroniPublishedHtml,
  slugForDropTitle,
} from "../features/macaroni/publish";
import {
  macaroniIpfsMaxBytes,
  uploadLimitLabel,
} from "../features/macaroni/upload-limits";
import { MEDIA_STAGING_DIR } from "../lib/storage/paths";
import {
  getMacaroniRevealOperator,
  requestMacaroniReveal,
  registerMacaroniRevealAutomation,
} from "../features/macaroni/reveal-automation";
import {
  createMacaroniRevealRegistrationChallenge,
  verifyMacaroniRevealRegistrationProof,
} from "../features/macaroni/reveal-auth";
import {
  createMacaroniV35RegistrationChallenge,
  verifyMacaroniV35RegistrationProof,
} from "../features/macaroni/v35-auth";
import {
  macaroniV35CapabilitiesForUser,
  attachManagedMacaroniV35Contract,
  pinManagedMacaroniV35PublicContractMetadata,
  getMacaroniV35CreatorSetup,
  getNextManagedMacaroniV35CreatorAction,
  getPublicMacaroniV35ClaimStatus,
  getPublicMacaroniV35PurchaseStatus,
  getPublicMacaroniV35Status,
  reconcileManagedMacaroniV35CreatorAttempt,
  recordManagedMacaroniV35SubmittedAttempt,
  recordManagedMacaroniV35WalletPromptAbort,
  recordManagedMacaroniV35WalletPromptStarted,
  recordManagedMacaroniV35WalletRejection,
  registerManagedMacaroniDrop,
  userCanUseManagedMacaroni,
  wakePublicMacaroniV35Drop,
} from "../features/macaroni/v35-service";
import {
  macaroniV35IdentitySchema,
  macaroniV35NextCreatorActionSchema,
  macaroniV35AttachSchema,
  macaroniV35NetworkSchema,
  macaroniV35RegistrationSchema,
  macaroniV35SubmittedAttemptSchema,
  macaroniV35WalletPromptAbortedSchema,
  macaroniV35WalletPromptStartedSchema,
  macaroniV35WalletRejectedAttemptSchema,
  hashMacaroniV35Payload,
  managedMacaroniRuntimeReadiness,
} from "../features/macaroni/v35-types";
import { stageManagedMacaroniV35Token } from "../features/macaroni/v35-managed-assets";
import { stageAndPinUpload } from "../features/ipfs-pinning/service";
import {
  listWtfosOutboxForSource,
  publishQueuedWtfosOutboxForSource,
} from "../features/tz2at/wtfos-outbox";
import {
  atprotoAccounts,
  macaroniV35Drops,
  users,
} from "@shared/schema";

const router = Router();

const MACARONI_UPLOAD_AUDIENCE = "macaroni-ipfs-upload";
const MACARONI_UPLOAD_PATH = "/api/macaroni/ipfs/upload";
const MACARONI_V35_PRIVATE_UPLOAD_AUDIENCE = "macaroni-v35-private-asset-upload";
const MACARONI_V35_PRIVATE_UPLOAD_PATH = "/api/macaroni/v35/private-assets/upload";
const MACARONI_UPLOAD_TICKET_TTL_MS = 10 * 60 * 1000;
const MACARONI_TOKEN_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
const MACARONI_TOKEN_PREVIEW_INPUT_MAX_BYTES = 250 * 1024 * 1024;
const MACARONI_TOKEN_PREVIEW_TIMEOUT_MS = 45_000;
const MACARONI_TOKEN_PREVIEW_MAX_CONCURRENT = 2;
const MACARONI_TOKEN_PREVIEW_MIME_TYPES = new Set([
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
let activeMacaroniTokenPreviewJobs = 0;
const KT1_CONTRACT_ADDRESS = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
const INSTALLER_PLATFORMS = [
  {
    key: "macos",
    label: "macOS",
    env: "MACARONI_INSTALLER_MACOS_URL",
    sha256Env: "MACARONI_INSTALLER_MACOS_SHA256",
    fileName: "Macaroni-Studio.dmg",
  },
  {
    key: "windows",
    label: "Windows",
    env: "MACARONI_INSTALLER_WINDOWS_URL",
    sha256Env: "MACARONI_INSTALLER_WINDOWS_SHA256",
    fileName: "Macaroni-Studio.exe",
  },
  {
    key: "raspberry-pi",
    label: "Raspberry Pi",
    env: "MACARONI_INSTALLER_RASPBERRY_PI_URL",
    sha256Env: "MACARONI_INSTALLER_RASPBERRY_PI_SHA256",
    fileName: "macaroni-studio-arm64.deb",
  },
] as const;

const publishSchema = z.object({
  config: z.object({}).passthrough(),
  slug: z.string().trim().min(1).max(80).optional(),
});

const revealNetworkSchema = z.enum(["mainnet", "shadownet"]);
const revealIdentitySchema = z.object({
  network: revealNetworkSchema,
  contract: z.string().regex(KT1_CONTRACT_ADDRESS),
  administrator: z.string().regex(/^(tz1|tz2|tz3|tz4)[1-9A-HJ-NP-Za-km-z]{33}$/),
});
const revealRegistrationSchema = z.object({
  ...revealIdentitySchema.shape,
  mode: z.enum(["instant", "delayed"]),
  revealDelaySeconds: z.number().int().nonnegative(),
  tokens: z.array(z.object({
    tokenId: z.number().int().nonnegative(),
    metadataUri: z.string().regex(/^ipfs:\/\/[^\s]+$/),
    nonce: z.string().regex(/^[0-9a-f]{64}$/i),
    commitment: z.string().regex(/^[0-9a-f]{64}$/i),
  })).nonempty(),
  proof: z.object({
    nonce: z.string().regex(/^[0-9a-f]{64}$/i),
    publicKey: z.string().trim().min(1).max(128),
    signature: z.string().trim().min(1).max(256),
  }),
});
const revealRequestSchema = z.object({
  network: revealNetworkSchema,
  contract: z.string().regex(KT1_CONTRACT_ADDRESS),
});

const uploadTicketSchema = z.object({
  fileName: z.string().trim().min(1).max(260).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  mimeType: z.string().trim().max(160).optional(),
});

type MacaroniUploadTicket = {
  v: 1;
  aud: typeof MACARONI_UPLOAD_AUDIENCE;
  sub: number;
  jti: string;
  exp: number;
  fileName: string;
  byteSize: number | null;
  mimeType: string;
  maxBytes: number;
};

type MacaroniUploadRequest = Request & {
  macaroniUploadTicket?: MacaroniUploadTicket;
};

type MacaroniV35PrivateUploadDescriptor = {
  fileName: string;
  byteSize: number;
  mimeType: string;
};

type MacaroniV35PrivateUploadTicket = {
  v: 1;
  aud: typeof MACARONI_V35_PRIVATE_UPLOAD_AUDIENCE;
  sub: number;
  jti: string;
  exp: number;
  dropId: number;
  registrationDigest: string;
  tokenId: number;
  quantity: number;
  metadataDigest: string;
  artifact: MacaroniV35PrivateUploadDescriptor;
  display: MacaroniV35PrivateUploadDescriptor | null;
  thumbnail: MacaroniV35PrivateUploadDescriptor | null;
  maxBytes: number;
};

type MacaroniV35PrivateUploadRequest = Request & {
  macaroniV35PrivateUploadTicket?: MacaroniV35PrivateUploadTicket;
};

const usedUploadTickets = new Map<string, number>();

const v35PrivateUploadDescriptorSchema = z.object({
  fileName: z.string().trim().min(1).max(260),
  byteSize: z.number().int().positive(),
  mimeType: z.string().trim().min(1).max(160),
});

const v35PrivateUploadTicketRequestSchema = z.object({
  registrationDigest: z.string().regex(/^[0-9a-f]{64}$/),
  tokenId: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()),
  artifact: v35PrivateUploadDescriptorSchema,
  display: v35PrivateUploadDescriptorSchema.nullable().optional(),
  thumbnail: v35PrivateUploadDescriptorSchema.nullable().optional(),
});

function macaroniUploadTicketSecret(): string {
  return process.env.MACARONI_UPLOAD_TICKET_SECRET || getSessionSecret();
}

function safeDirectUploadOrigin(): string {
  const text = String(process.env.MACARONI_DIRECT_UPLOAD_ORIGIN || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:" && local)) {
      return url.origin;
    }
  } catch (_) {
    return "";
  }
  return "";
}

function macaroniUploadUrl(): string {
  const origin = safeDirectUploadOrigin();
  return origin ? `${origin}${MACARONI_UPLOAD_PATH}` : MACARONI_UPLOAD_PATH;
}

function macaroniV35PrivateUploadUrl(): string {
  const origin = safeDirectUploadOrigin();
  return origin
    ? `${origin}${MACARONI_V35_PRIVATE_UPLOAD_PATH}`
    : MACARONI_V35_PRIVATE_UPLOAD_PATH;
}

function signUploadTicketPayload(encodedPayload: string): string {
  return createHmac("sha256", macaroniUploadTicketSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function createMacaroniUploadTicket(input: {
  userId: number;
  fileName?: string;
  byteSize?: number;
  mimeType?: string;
}): { token: string; ticket: MacaroniUploadTicket } {
  const ticket: MacaroniUploadTicket = {
    v: 1,
    aud: MACARONI_UPLOAD_AUDIENCE,
    sub: input.userId,
    jti: randomBytes(18).toString("base64url"),
    exp: Date.now() + MACARONI_UPLOAD_TICKET_TTL_MS,
    fileName: String(input.fileName || "macaroni-upload").slice(0, 260),
    byteSize: Number.isInteger(input.byteSize) ? Number(input.byteSize) : null,
    mimeType: String(input.mimeType || "application/octet-stream").slice(0, 160),
    maxBytes: macaroniIpfsMaxBytes(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return {
    token: `${encodedPayload}.${signUploadTicketPayload(encodedPayload)}`,
    ticket,
  };
}

function createMacaroniV35PrivateUploadTicket(input: {
  userId: number;
  dropId: number;
  registrationDigest: string;
  tokenId: number;
  quantity: number;
  metadata: Record<string, unknown>;
  artifact: MacaroniV35PrivateUploadDescriptor;
  display?: MacaroniV35PrivateUploadDescriptor | null;
  thumbnail?: MacaroniV35PrivateUploadDescriptor | null;
}): { token: string; ticket: MacaroniV35PrivateUploadTicket } {
  const ticket: MacaroniV35PrivateUploadTicket = {
    v: 1,
    aud: MACARONI_V35_PRIVATE_UPLOAD_AUDIENCE,
    sub: input.userId,
    jti: randomBytes(18).toString("base64url"),
    exp: Date.now() + MACARONI_UPLOAD_TICKET_TTL_MS,
    dropId: input.dropId,
    registrationDigest: input.registrationDigest,
    tokenId: input.tokenId,
    quantity: input.quantity,
    metadataDigest: hashMacaroniV35Payload(input.metadata),
    artifact: input.artifact,
    display: input.display ?? null,
    thumbnail: input.thumbnail ?? null,
    maxBytes: macaroniIpfsMaxBytes(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return {
    token: `${encodedPayload}.${signUploadTicketPayload(encodedPayload)}`,
    ticket,
  };
}

function cleanupUsedUploadTickets(now = Date.now()) {
  for (const [jti, exp] of usedUploadTickets.entries()) {
    if (exp <= now) usedUploadTickets.delete(jti);
  }
}

function verifyMacaroniUploadTicket(token: string): MacaroniUploadTicket | null {
  const [encodedPayload, signature, extra] = String(token || "").split(".");
  if (!encodedPayload || !signature || extra) return null;
  const expected = signUploadTicketPayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }
  let ticket: MacaroniUploadTicket;
  try {
    ticket = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as MacaroniUploadTicket;
  } catch (_) {
    return null;
  }
  if (ticket.v !== 1 || ticket.aud !== MACARONI_UPLOAD_AUDIENCE) return null;
  if (!Number.isInteger(ticket.sub) || ticket.sub < 1) return null;
  if (!ticket.jti || !Number.isFinite(ticket.exp) || ticket.exp <= Date.now()) return null;
  if (!Number.isInteger(ticket.maxBytes) || ticket.maxBytes < 1 || ticket.maxBytes > macaroniIpfsMaxBytes()) return null;
  if (ticket.byteSize != null && (!Number.isInteger(ticket.byteSize) || ticket.byteSize < 0 || ticket.byteSize > ticket.maxBytes)) {
    return null;
  }
  cleanupUsedUploadTickets();
  if (usedUploadTickets.has(ticket.jti)) return null;
  usedUploadTickets.set(ticket.jti, ticket.exp);
  return ticket;
}

function verifyMacaroniV35PrivateUploadTicket(token: string): MacaroniV35PrivateUploadTicket | null {
  const [encodedPayload, signature, extra] = String(token || "").split(".");
  if (!encodedPayload || !signature || extra) return null;
  const expected = signUploadTicketPayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  let ticket: MacaroniV35PrivateUploadTicket;
  try {
    ticket = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as MacaroniV35PrivateUploadTicket;
  } catch {
    return null;
  }
  if (ticket.v !== 1 || ticket.aud !== MACARONI_V35_PRIVATE_UPLOAD_AUDIENCE) return null;
  if (!Number.isInteger(ticket.sub) || ticket.sub < 1) return null;
  if (!Number.isSafeInteger(ticket.dropId) || ticket.dropId < 1) return null;
  if (!Number.isSafeInteger(ticket.tokenId) || ticket.tokenId < 0) return null;
  if (!Number.isSafeInteger(ticket.quantity) || ticket.quantity < 1) return null;
  if (!/^[0-9a-f]{64}$/.test(ticket.registrationDigest) || !/^[0-9a-f]{64}$/.test(ticket.metadataDigest)) return null;
  if (!ticket.jti || !Number.isFinite(ticket.exp) || ticket.exp <= Date.now()) return null;
  if (!Number.isInteger(ticket.maxBytes) || ticket.maxBytes < 1 || ticket.maxBytes > macaroniIpfsMaxBytes()) return null;
  const descriptors = [ticket.artifact, ticket.display, ticket.thumbnail].filter(Boolean) as MacaroniV35PrivateUploadDescriptor[];
  if (!ticket.artifact || descriptors.some((file) => !file.fileName
    || !Number.isSafeInteger(file.byteSize) || file.byteSize < 1 || file.byteSize > ticket.maxBytes
    || !file.mimeType)) return null;
  cleanupUsedUploadTickets();
  if (usedUploadTickets.has(ticket.jti)) return null;
  usedUploadTickets.set(ticket.jti, ticket.exp);
  return ticket;
}

function bearerToken(req: Request): string {
  const value = String(req.get("authorization") || "");
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function requireMacaroniUploadTicket(req: Request, res: Response, next: NextFunction) {
  const ticket = verifyMacaroniUploadTicket(bearerToken(req));
  if (!ticket) {
    return res.status(401).json({ error: "Invalid or expired Macaroni upload ticket" });
  }
  (req as MacaroniUploadRequest).macaroniUploadTicket = ticket;
  return next();
}

function requireMacaroniV35PrivateUploadTicket(req: Request, res: Response, next: NextFunction) {
  const ticket = verifyMacaroniV35PrivateUploadTicket(bearerToken(req));
  if (!ticket) return res.status(401).json({ error: "Invalid or expired Macaroni V3.5 private upload ticket" });
  (req as MacaroniV35PrivateUploadRequest).macaroniV35PrivateUploadTicket = ticket;
  return next();
}

function isLoopbackInstallerHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function safeInstallerUrl(value: string | undefined): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("/") && !text.startsWith("//") && !/[\r\n]/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol === "https:") return url.href;
    if (process.env.NODE_ENV !== "production" && url.protocol === "http:" && isLoopbackInstallerHost(url.hostname)) {
      return url.href;
    }
    return "";
  } catch (_) {
    return "";
  }
}

function safeInstallerSha256(value: string | undefined): string {
  const text = String(value || "").trim().toLowerCase().replace(/^sha256:/, "");
  return /^[0-9a-f]{64}$/.test(text) ? text : "";
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

const tokenPreviewUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MACARONI_TOKEN_PREVIEW_INPUT_MAX_BYTES,
    files: 1,
    fields: 4,
    fieldSize: 64 * 1024,
  },
});

const v35PrivateAssetUploadDirectory = path.join(MEDIA_STAGING_DIR, "macaroni-v35-private-upload");
const v35PrivateAssetUpload = multer({
  storage: multer.diskStorage({
    destination(_request, _file, callback) {
      void mkdir(v35PrivateAssetUploadDirectory, { recursive: true }).then(
        () => callback(null, v35PrivateAssetUploadDirectory),
        (error) => callback(error instanceof Error ? error : new Error(String(error)), v35PrivateAssetUploadDirectory),
      );
    },
  }),
  limits: {
    fileSize: macaroniIpfsMaxBytes(),
    files: 3,
    fields: 8,
    fieldSize: 1024 * 1024,
  },
});

const v35PrivateAssetFieldsSchema = z.object({
  registrationDigest: z.string().regex(/^[0-9a-f]{64}$/),
  tokenId: z.coerce.number().int().nonnegative(),
  quantity: z.coerce.number().int().positive(),
  metadata: z.string().transform((value, ctx) => {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("metadata must be an object");
      return parsed as Record<string, unknown>;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "metadata must be valid JSON object text" });
      return z.NEVER;
    }
  }),
});

const v35PublicContractMetadataFieldsSchema = z.object({
  registrationDigest: z.string().regex(/^[0-9a-f]{64}$/),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5_000),
  homepage: z.string().trim().max(2_000).optional().transform((value, ctx) => {
    if (!value) return undefined;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
      return parsed.toString();
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Homepage must be an HTTP(S) URL" });
      return z.NEVER;
    }
  }),
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

function runV35PublicContractMetadataUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("cover")(req, res, (err: unknown) => {
    if (!err) return next();
    const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
      ? `Cover exceeds the ${uploadLimitLabel(macaroniIpfsMaxBytes())} managed metadata limit`
      : "Invalid Macaroni V3.5 collection cover upload";
    return res.status(400).json({ error: message });
  });
}

function runTokenPreviewUpload(req: Request, res: Response, next: NextFunction) {
  tokenPreviewUpload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const message =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "Token preview input exceeds the 250 MB Macaroni preview processing limit"
        : "Invalid Macaroni token preview upload";
    return res.status(400).json({ error: message });
  });
}

function runV35PrivateAssetUpload(req: Request, res: Response, next: NextFunction) {
  v35PrivateAssetUpload.fields([
    { name: "artifact", maxCount: 1 },
    { name: "display", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ])(req, res, (err: unknown) => {
    if (!err) return next();
    const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
      ? `Artifact exceeds the ${uploadLimitLabel(macaroniIpfsMaxBytes())} private-staging limit`
      : "Invalid Macaroni V3.5 private artifact or preview upload";
    return res.status(400).json({ error: message });
  });
}

function uploadedFileMatchesDescriptor(
  file: Express.Multer.File | undefined,
  descriptor: MacaroniV35PrivateUploadDescriptor | null
) {
  if (!descriptor) return !file;
  return Boolean(file
    && file.originalname === descriptor.fileName
    && file.size === descriptor.byteSize
    && file.mimetype === descriptor.mimeType);
}

async function respondToV35PrivateAssetUpload(input: {
  req: Request;
  res: Response;
  ownerUserId: number;
  dropId: number;
  ticket?: MacaroniV35PrivateUploadTicket;
}) {
  const parsed = v35PrivateAssetFieldsSchema.safeParse(input.req.body);
  const files = (input.req.files || {}) as Record<string, Express.Multer.File[]>;
  const artifactFile = files.artifact?.[0];
  const displayFile = files.display?.[0];
  const thumbnailFile = files.thumbnail?.[0];
  const artifactPath = artifactFile?.path;
  const uploadedPaths = [artifactPath, displayFile?.path, thumbnailFile?.path].filter(Boolean) as string[];
  if (!Number.isSafeInteger(input.dropId) || input.dropId < 1 || !parsed.success || !artifactPath) {
    await Promise.all(uploadedPaths.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));
    return input.res.status(400).json({
      error: "A token id, quantity, metadata JSON, registration digest, and artifact file are required",
    });
  }
  if (input.ticket) {
    const bound = input.ticket.dropId === input.dropId
      && input.ticket.registrationDigest === parsed.data.registrationDigest
      && input.ticket.tokenId === parsed.data.tokenId
      && input.ticket.quantity === parsed.data.quantity
      && input.ticket.metadataDigest === hashMacaroniV35Payload(parsed.data.metadata)
      && uploadedFileMatchesDescriptor(artifactFile, input.ticket.artifact)
      && uploadedFileMatchesDescriptor(displayFile, input.ticket.display)
      && uploadedFileMatchesDescriptor(thumbnailFile, input.ticket.thumbnail);
    if (!bound) {
      await Promise.all(uploadedPaths.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));
      return input.res.status(409).json({ error: "Private upload did not match its creator-approved ticket" });
    }
  }
  try {
    const staged = await stageManagedMacaroniV35Token({
      ownerUserId: input.ownerUserId,
      dropId: input.dropId,
      registrationDigest: parsed.data.registrationDigest,
      tokenId: parsed.data.tokenId,
      quantity: parsed.data.quantity,
      artifactPath,
      artifactMimeType: artifactFile?.mimetype || "application/octet-stream",
      displayPath: displayFile?.path,
      displayMimeType: displayFile?.mimetype,
      thumbnailPath: thumbnailFile?.path,
      thumbnailMimeType: thumbnailFile?.mimetype,
      metadata: parsed.data.metadata,
    });
    if (!staged) return input.res.status(404).json({ error: "Macaroni V3.5 setup not found" });
    return input.res.status(201).json({
      ok: true,
      ...staged,
      privateCidDisclosed: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not stage private V3.5 asset";
    return input.res.status(409).json({ error: message });
  } finally {
    await Promise.all(uploadedPaths.map((filePath) => rm(filePath, { force: true }).catch(() => undefined)));
  }
}

function tryAcquireMacaroniTokenPreviewSlot(): boolean {
  if (activeMacaroniTokenPreviewJobs >= MACARONI_TOKEN_PREVIEW_MAX_CONCURRENT) return false;
  activeMacaroniTokenPreviewJobs += 1;
  return true;
}

function releaseMacaroniTokenPreviewSlot(): void {
  activeMacaroniTokenPreviewJobs = Math.max(0, activeMacaroniTokenPreviewJobs - 1);
}

async function requireManagedMacaroniAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not evaluate Managed Macaroni access";
    return res.status(503).json({ error: message });
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`ffmpeg timed out after ${MACARONI_TOKEN_PREVIEW_TIMEOUT_MS}ms`));
    }, MACARONI_TOKEN_PREVIEW_TIMEOUT_MS);
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 32_000) stderr = stderr.slice(-16_000);
    });
    child.once("error", (err) => finish(err));
    child.once("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600).trim()}`));
    });
  });
}

async function makeMacaroniTokenPreview(inputBuffer: Buffer, fileName: string): Promise<Buffer> {
  const root = await mkdtemp(path.join(tmpdir(), "wtf-macaroni-token-preview-"));
  const ext = path.extname(fileName || "").replace(/[^.\w-]/g, "").slice(0, 12) || ".media";
  const input = path.join(root, `source${ext}`);
  const output = path.join(root, "preview.gif");
  try {
    await writeFile(input, inputBuffer);
    const attempts = [
      { side: 640, fps: 12, colors: 96, dither: "bayer:bayer_scale=5" },
      { side: 480, fps: 10, colors: 64, dither: "bayer:bayer_scale=6" },
      { side: 360, fps: 8, colors: 48, dither: "bayer:bayer_scale=7" },
      { side: 280, fps: 6, colors: 32, dither: "bayer:bayer_scale=8" },
    ];
    let lastError: Error | null = null;
    for (const attempt of attempts) {
      await rm(output, { force: true }).catch(() => undefined);
      const scale =
        `scale='min(${attempt.side},iw)':'min(${attempt.side},ih)':` +
        "force_original_aspect_ratio=decrease";
      const vf =
        `fps=${attempt.fps},${scale},split[s0][s1];` +
        `[s0]palettegen=max_colors=${attempt.colors}[p];` +
        `[s1][p]paletteuse=dither=${attempt.dither}`;
      try {
        await runFfmpeg([
          "-y",
          "-hide_banner",
          "-loglevel", "error",
          "-nostdin",
          "-t", "12",
          "-i", input,
          "-filter_complex", vf,
          "-loop", "0",
          output,
        ]);
        const outStat = await stat(output);
        if (outStat.size > 0 && outStat.size <= MACARONI_TOKEN_PREVIEW_MAX_BYTES) {
          return await readFile(output);
        }
        lastError = new Error(`preview was ${outStat.size} bytes after ${attempt.side}px/${attempt.fps}fps compression`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError || new Error("ffmpeg did not produce a token preview");
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

function publicOrigin(req: Request): string {
  const configured = process.env.PUBLIC_SITE_URL || process.env.APP_PUBLIC_URL || "";
  if (configured.trim()) return configured.trim().replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`.replace(/\/+$/, "");
}

function dropSlug(input: { slug?: string; title?: unknown }): string | null {
  const explicit = input.slug?.trim();
  const raw = explicit || slugForDropTitle(input.title);
  const normalized = normalizeUserSiteSlug(raw);
  if (!normalized || normalized === WTF_USER_SITE_HOME_SLUG) {
    return explicit ? null : "macaroni-drop";
  }
  return normalized;
}

function normalizeMacaroniContract(value: unknown): string | null {
  const contract = String(value || "").trim();
  return KT1_CONTRACT_ADDRESS.test(contract) ? contract : null;
}

function normalizeCreatorSocialHandle(value: unknown): string {
  const cleaned = String(value || "")
    .trim()
    .replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/@?/i, "")
    .replace(/^https?:\/\/(?:www\.)?bsky\.app\/profile\/@?/i, "")
    .replace(/^@+/, "")
    .split(/[?#\s]/)[0]
    .replace(/\/+$/, "");
  return cleaned.replace(/[^a-z0-9._-]/gi, "").slice(0, 120);
}

function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function loadMacaroniCreatorSocial(userId: number): Promise<{
  twitter: string;
  bsky: string;
}> {
  const [profile] = await db
    .select({
      twitterHandle: users.twitterHandle,
      twitterPublic: users.twitterPublic,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [atproto] = await db
    .select({
      handle: atprotoAccounts.handle,
    })
    .from(atprotoAccounts)
    .where(and(eq(atprotoAccounts.userId, userId), isNull(atprotoAccounts.disconnectedAt)))
    .orderBy(desc(atprotoAccounts.updatedAt))
    .limit(1);
  return {
    twitter: profile?.twitterPublic ? normalizeCreatorSocialHandle(profile.twitterHandle) : "",
    bsky: normalizeCreatorSocialHandle(atproto?.handle),
  };
}

function enrichMacaroniCreatorSocial(
  config: Record<string, unknown>,
  creatorSocial: { twitter: string; bsky: string }
): Record<string, unknown> {
  const social = plainRecord(config.social);
  const twitter = normalizeCreatorSocialHandle(social.twitter || social.x) || creatorSocial.twitter;
  const bsky = normalizeCreatorSocialHandle(social.bsky || social.bluesky) || creatorSocial.bsky;
  return {
    ...config,
    social: {
      ...social,
      twitter,
      bsky,
    },
  };
}

function handleMacaroniSiteError(res: Response, err: unknown) {
  if (err instanceof WtfUserSiteError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error("[macaroni] route error:", err);
  return res.status(500).json({ error: "Failed to process Macaroni request" });
}

function summarizePdsDelivery(rows: Awaited<ReturnType<typeof listWtfosOutboxForSource>>) {
  const expected = 3;
  const published = rows.filter((row) => row?.status === "published").length;
  const failed = rows.filter((row) => row?.status === "failed").length;
  const skipped = rows.filter((row) => row?.status === "skipped").length;
  const pending = rows.filter((row) => row?.status === "queued").length;
  return {
    expected,
    total: rows.length,
    published,
    failed,
    skipped,
    pending,
    ready: rows.length >= expected && published >= expected && failed === 0 && skipped === 0 && pending === 0,
  };
}

async function probePublicMacaroniUrl(url: string): Promise<{
  live: boolean;
  status: number | null;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
    });
    return {
      live: response.status >= 200 && response.status < 400,
      status: response.status,
    };
  } catch (err) {
    return {
      live: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

router.post(
  "/api/macaroni/ipfs/upload-ticket",
  requirePermission("trusted_market_creator", "use_managed_macaroni"),
  (req, res) => {
    const parsed = uploadTicketSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid Macaroni upload ticket request" });
    }

    const byteSize = parsed.data.byteSize;
    const maxBytes = macaroniIpfsMaxBytes();
    if (byteSize != null && byteSize > maxBytes) {
      return res.status(400).json({
        error: `File exceeds the ${uploadLimitLabel(maxBytes)} Macaroni IPFS upload limit`,
      });
    }

    const user = req.user as { id: number };
    const { token, ticket } = createMacaroniUploadTicket({
      userId: user.id,
      fileName: parsed.data.fileName,
      byteSize,
      mimeType: parsed.data.mimeType,
    });
    return res.json({
      token,
      uploadUrl: macaroniUploadUrl(),
      direct: Boolean(safeDirectUploadOrigin()),
      expiresAt: new Date(ticket.exp).toISOString(),
      maxBytes: ticket.maxBytes,
    });
  }
);

router.post(
  MACARONI_UPLOAD_PATH,
  requireMacaroniUploadTicket,
  runPinUpload,
  async (req, res) => {
    const ticket = (req as MacaroniUploadRequest).macaroniUploadTicket;
    const file = req.file;
    if (!ticket) return res.status(401).json({ error: "Invalid or expired Macaroni upload ticket" });
    if (!file) return res.status(400).json({ error: "Upload a file to pin" });
    if (ticket.byteSize != null && file.buffer.length !== ticket.byteSize) {
      return res.status(400).json({ error: "Macaroni upload size did not match the upload ticket" });
    }

    try {
      const result = await stageAndPinUpload({
        userId: ticket.sub,
        fileName: file.originalname || ticket.fileName || "macaroni-upload",
        mimeType: file.mimetype || ticket.mimeType || "application/octet-stream",
        buffer: file.buffer,
        source: "macaroni",
        scopeType: "macaroni_drop",
      });
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Macaroni IPFS pinning failed";
      return res.status((err as { status?: number })?.status ?? 503).json({
        error: message,
        code: (err as { code?: string })?.code,
      });
    }
  }
);

router.post(
  "/api/macaroni/ipfs/pin",
  requirePermission("trusted_market_creator", "use_managed_macaroni"),
  runPinUpload,
  async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Upload a file to pin" });

    try {
      const user = req.user as { id: number };
      const result = await stageAndPinUpload({
        userId: user.id,
        fileName: file.originalname || "macaroni-upload",
        mimeType: file.mimetype || "application/octet-stream",
        buffer: file.buffer,
        source: "macaroni",
        scopeType: "macaroni_drop",
      });
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Macaroni IPFS pinning failed";
      return res.status((err as { status?: number })?.status ?? 503).json({
        error: message,
        code: (err as { code?: string })?.code,
      });
    }
  }
);

router.post(
  "/api/macaroni/media-preview",
  isAuthenticated,
  runTokenPreviewUpload,
  async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Upload a token media file to preview" });
    const mime = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "");
    const extensionAllowed = /\.(gif|mp4|webm|mov)$/i.test(name);
    if (!MACARONI_TOKEN_PREVIEW_MIME_TYPES.has(mime) && !extensionAllowed) {
      return res.status(400).json({ error: "Macaroni preview processing only accepts GIF, MP4, WebM, or MOV files" });
    }
    if (!tryAcquireMacaroniTokenPreviewSlot()) {
      return res.status(429).json({ error: "Macaroni token preview processing is busy; try again in a moment" });
    }

    try {
      const preview = await makeMacaroniTokenPreview(file.buffer, file.originalname || "source.media");
      res.setHeader("Content-Type", "image/gif");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Macaroni-Preview-Kind", "animated-gif");
      res.setHeader("X-Macaroni-Preview-Max-Bytes", String(MACARONI_TOKEN_PREVIEW_MAX_BYTES));
      return res.send(preview);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create token preview";
      return res.status(422).json({
        error: `Could not create OBJKT-sized token preview: ${message}`,
      });
    } finally {
      releaseMacaroniTokenPreviewSlot();
    }
  }
);

router.get("/api/macaroni/installers", isAuthenticated, (_req, res) => {
  const version = String(process.env.MACARONI_INSTALLER_VERSION || "").trim();
  return res.json({
    ok: true,
    version: version || null,
    installers: INSTALLER_PLATFORMS.map((platform) => {
      const url = safeInstallerUrl(process.env[platform.env]);
      const sha256 = safeInstallerSha256(process.env[platform.sha256Env]);
      return {
        key: platform.key,
        label: platform.label,
        fileName: platform.fileName,
        sha256: sha256 || null,
        available: Boolean(url && sha256),
        url: url && sha256 ? url : null,
      };
    }),
  });
});

router.get("/api/macaroni/v35/capabilities", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const requestedNetwork = req.query.network;
    const network = requestedNetwork == null || requestedNetwork === ""
      ? undefined
      : macaroniV35NetworkSchema.safeParse(requestedNetwork);
    if (network && !network.success) {
      return res.status(400).json({ error: "Managed Macaroni network must be mainnet or shadownet" });
    }
    return res.json(await macaroniV35CapabilitiesForUser(
      req.user as { id?: number; role?: string; roles?: string[] } | undefined,
      network?.data
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not evaluate Managed Macaroni access";
    return res.status(503).json({ error: message });
  }
});

router.post("/api/macaroni/v35/registration/challenge", isAuthenticated, async (req, res) => {
  const parsed = macaroniV35IdentitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Macaroni V3.5 setup identity" });
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    res.setHeader("Cache-Control", "no-store");
    return res.json(await createMacaroniV35RegistrationChallenge(parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create Macaroni V3.5 registration challenge";
    return res.status(503).json({ error: message });
  }
});

router.post("/api/macaroni/v35/drops", isAuthenticated, async (req, res) => {
  const parsed = macaroniV35RegistrationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid Macaroni V3.5 managed setup",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    const { proof, ...registration } = parsed.data;
    try {
      await verifyMacaroniV35RegistrationProof(registration, proof);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wallet proof failed";
      return res.status(401).json({ error: message });
    }
    const ownerUserId = Number((req.user as { id?: number }).id);
    const drop = await registerManagedMacaroniDrop({
      ownerUserId,
      registration,
      administratorPublicKey: proof.publicKey,
    });
    return res.status(201).json({
      ok: true,
      dropId: drop.id,
      clientSetupId: drop.clientSetupId,
      registrationDigest: drop.registrationDigest,
      network: drop.network,
      contract: drop.contract,
      status: drop.status,
      serviceReady: false,
      blocker: managedMacaroniRuntimeReadiness(drop.network),
      setupPath: `/api/macaroni/v35/drops/${drop.id}/setup`,
      publicContractMetadataPath: `/api/macaroni/v35/drops/${drop.id}/public-contract-metadata`,
      privateAssetsPath: `/api/macaroni/v35/drops/${drop.id}/private-assets`,
      nextActionPath: `/api/macaroni/v35/drops/${drop.id}/next-action`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not register Macaroni V3.5 setup";
    return res.status(409).json({ error: message });
  }
});

router.post(
  "/api/macaroni/v35/drops/:dropId/public-contract-metadata",
  isAuthenticated,
  requireManagedMacaroniAccess,
  runV35PublicContractMetadataUpload,
  async (req, res) => {
    const dropId = Number(req.params.dropId);
    const parsed = v35PublicContractMetadataFieldsSchema.safeParse(req.body || {});
    const cover = req.file;
    if (!Number.isSafeInteger(dropId) || dropId < 1 || !parsed.success || !cover) {
      return res.status(400).json({
        error: "A registration digest, collection name, description, and cover file are required",
        issues: parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    try {
      const result = await pinManagedMacaroniV35PublicContractMetadata({
        ownerUserId: Number((req.user as { id?: number }).id),
        dropId,
        ...parsed.data,
        coverFileName: cover.originalname || "macaroni-v35-cover",
        coverMimeType: cover.mimetype || "application/octet-stream",
        coverBytes: cover.buffer,
      });
      if (!result) return res.status(404).json({ error: "Macaroni V3.5 setup not found" });
      return res.status(result.created ? 201 : 200).json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not pin managed collection metadata";
      return res.status(409).json({ error: message });
    }
  }
);

router.get("/api/macaroni/v35/drops/:dropId/setup", isAuthenticated, async (req, res) => {
  const dropId = Number(req.params.dropId);
  if (!Number.isSafeInteger(dropId) || dropId < 1) return res.status(400).json({ error: "Invalid drop id" });
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    const ownerUserId = Number((req.user as { id?: number }).id);
    const setup = await getMacaroniV35CreatorSetup({ ownerUserId, dropId });
    if (!setup) return res.status(404).json({ error: "Macaroni V3.5 setup not found" });
    res.setHeader("Cache-Control", "no-store");
    return res.json(setup);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Macaroni V3.5 setup";
    return res.status(503).json({ error: message });
  }
});

router.post("/api/macaroni/v35/drops/:dropId/next-action", isAuthenticated, async (req, res) => {
  const dropId = Number(req.params.dropId);
  const parsed = macaroniV35NextCreatorActionSchema.safeParse(req.body || {});
  if (!Number.isSafeInteger(dropId) || dropId < 1 || !parsed.success) {
    return res.status(400).json({
      error: "Invalid V3.5 next creator action request",
      issues: parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    const action = await getNextManagedMacaroniV35CreatorAction({
      ownerUserId: Number((req.user as { id?: number }).id),
      dropId,
      ...parsed.data,
    });
    if (!action) return res.status(404).json({ error: "Macaroni V3.5 setup not found" });
    res.setHeader("Cache-Control", "no-store");
    return res.json(action);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not determine the next V3.5 creator action";
    return res.status(409).json({ error: message });
  }
});

router.post(
  "/api/macaroni/v35/drops/:dropId/private-assets/upload-ticket",
  isAuthenticated,
  requireManagedMacaroniAccess,
  async (req, res) => {
    const dropId = Number(req.params.dropId);
    const parsed = v35PrivateUploadTicketRequestSchema.safeParse(req.body || {});
    if (!Number.isSafeInteger(dropId) || dropId < 1 || !parsed.success) {
      return res.status(400).json({
        error: "Invalid Macaroni V3.5 private upload ticket request",
        issues: parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    const maxBytes = macaroniIpfsMaxBytes();
    const descriptors = [parsed.data.artifact, parsed.data.display, parsed.data.thumbnail].filter(Boolean) as MacaroniV35PrivateUploadDescriptor[];
    if (descriptors.some((file) => file.byteSize > maxBytes)) {
      return res.status(400).json({
        error: `A private file exceeds the ${uploadLimitLabel(maxBytes)} Macaroni V3.5 upload limit`,
      });
    }
    const { token, ticket } = createMacaroniV35PrivateUploadTicket({
      userId: Number((req.user as { id?: number }).id),
      dropId,
      ...parsed.data,
    });
    return res.json({
      schema: "wtfos.macaroni-v35-private-upload-ticket.v1",
      token,
      uploadUrl: macaroniV35PrivateUploadUrl(),
      direct: Boolean(safeDirectUploadOrigin()),
      expiresAt: new Date(ticket.exp).toISOString(),
      maxBytes: ticket.maxBytes,
    });
  }
);

router.post(
  MACARONI_V35_PRIVATE_UPLOAD_PATH,
  requireMacaroniV35PrivateUploadTicket,
  runV35PrivateAssetUpload,
  async (req, res) => {
    const ticket = (req as MacaroniV35PrivateUploadRequest).macaroniV35PrivateUploadTicket;
    if (!ticket) return res.status(401).json({ error: "Invalid or expired Macaroni V3.5 private upload ticket" });
    return respondToV35PrivateAssetUpload({
      req,
      res,
      ownerUserId: ticket.sub,
      dropId: ticket.dropId,
      ticket,
    });
  }
);

router.post(
  "/api/macaroni/v35/drops/:dropId/private-assets",
  isAuthenticated,
  requireManagedMacaroniAccess,
  runV35PrivateAssetUpload,
  async (req, res) => {
    const dropId = Number(req.params.dropId);
    return respondToV35PrivateAssetUpload({
      req,
      res,
      ownerUserId: Number((req.user as { id?: number }).id),
      dropId,
    });
  }
);

router.post("/api/macaroni/v35/drops/:dropId/attach", isAuthenticated, async (req, res) => {
  const dropId = Number(req.params.dropId);
  const parsed = macaroniV35AttachSchema.safeParse(req.body);
  if (!Number.isSafeInteger(dropId) || dropId < 1 || !parsed.success) {
    return res.status(400).json({ error: "Invalid V3.5 contract attachment" });
  }
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    const result = await attachManagedMacaroniV35Contract({
      ownerUserId: Number((req.user as { id?: number }).id),
      dropId,
      ...parsed.data,
    });
    if (!result) return res.status(404).json({ error: "Macaroni V3.5 setup not found" });
    return res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not attach the originated contract";
    return res.status(409).json({ error: message });
  }
});

router.post("/api/macaroni/v35/drops/:dropId/attempts", isAuthenticated, async (req, res) => {
  const dropId = Number(req.params.dropId);
  if (!Number.isSafeInteger(dropId) || dropId < 1) return res.status(400).json({ error: "Invalid V3.5 drop id" });
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    return res.status(409).json({
      error: "Creator operation parameters are server-authored. Request the next durable action instead of constructing a wallet call in the browser.",
      code: "server_authoritative_next_action_required",
      nextActionPath: `/api/macaroni/v35/drops/${dropId}/next-action`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not authorize V3.5 setup operation routing";
    return res.status(409).json({ error: message });
  }
});

router.post("/api/macaroni/v35/drops/:dropId/attempts/:attemptId/wallet-rejected", isAuthenticated, async (req, res) => {
  const dropId = Number(req.params.dropId);
  const attemptId = Number(req.params.attemptId);
  const parsed = macaroniV35WalletRejectedAttemptSchema.safeParse(req.body || {});
  if (![dropId, attemptId].every((value) => Number.isSafeInteger(value) && value > 0) || !parsed.success) {
    return res.status(400).json({ error: "Invalid V3.5 wallet rejection record" });
  }
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    const attempt = await recordManagedMacaroniV35WalletRejection({
      ownerUserId: Number((req.user as { id?: number }).id),
      dropId,
      attemptId,
      requestId: parsed.data.requestId,
      confirmNoBroadcast: parsed.data.confirmNoBroadcast,
      reason: parsed.data.reason,
    });
    if (!attempt) return res.status(404).json({ error: "Macaroni V3.5 setup not found" });
    return res.json({ ok: true, attemptId: attempt.id, state: attempt.state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record wallet rejection";
    return res.status(409).json({ error: message });
  }
});

router.post("/api/macaroni/v35/drops/:dropId/attempts/:attemptId/wallet-prompt-started", isAuthenticated, async (req, res) => {
  const dropId = Number(req.params.dropId);
  const attemptId = Number(req.params.attemptId);
  const parsed = macaroniV35WalletPromptStartedSchema.safeParse(req.body || {});
  if (![dropId, attemptId].every((value) => Number.isSafeInteger(value) && value > 0) || !parsed.success) {
    return res.status(400).json({ error: "Invalid V3.5 wallet prompt boundary" });
  }
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    const attempt = await recordManagedMacaroniV35WalletPromptStarted({
      ownerUserId: Number((req.user as { id?: number }).id),
      dropId,
      attemptId,
      requestId: parsed.data.requestId,
    });
    if (!attempt) return res.status(404).json({ error: "Macaroni V3.5 setup not found" });
    return res.json({
      ok: true,
      attemptId: attempt.id,
      state: attempt.state,
      operationHash: attempt.operationHash,
      promptBoundaryPersisted: attempt.state === "wallet_prompt_started",
      proceedToWalletSend: attempt.state === "wallet_prompt_started" && !attempt.operationHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not persist wallet prompt boundary";
    return res.status(409).json({ error: message });
  }
});

router.post("/api/macaroni/v35/drops/:dropId/attempts/:attemptId/wallet-prompt-aborted", isAuthenticated, async (req, res) => {
  const dropId = Number(req.params.dropId);
  const attemptId = Number(req.params.attemptId);
  const parsed = macaroniV35WalletPromptAbortedSchema.safeParse(req.body || {});
  if (![dropId, attemptId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return res.status(400).json({ error: "Invalid V3.5 wallet abort target" });
  }
  if (!parsed.success) {
    return res.status(409).json({
      error: "A raw, identified remote Beacon ABORTED_ERROR response is required; preserve this prompt for operation recovery",
      code: "operation_hash_recovery_required",
    });
  }
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    const attempt = await recordManagedMacaroniV35WalletPromptAbort({
      ownerUserId: Number((req.user as { id?: number }).id),
      dropId,
      attemptId,
      ...parsed.data,
    });
    if (!attempt) return res.status(404).json({ error: "Macaroni V3.5 setup not found" });
    return res.json({
      ok: true,
      attemptId: attempt.id,
      state: attempt.state,
      retrySafe: attempt.state === "wallet_rejected",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not persist authenticated wallet abort";
    return res.status(409).json({ error: message, code: "operation_hash_recovery_required" });
  }
});

router.post("/api/macaroni/v35/drops/:dropId/attempts/:attemptId/submitted", isAuthenticated, async (req, res) => {
  const dropId = Number(req.params.dropId);
  const attemptId = Number(req.params.attemptId);
  const parsed = macaroniV35SubmittedAttemptSchema.safeParse(req.body);
  if (![dropId, attemptId].every((value) => Number.isSafeInteger(value) && value > 0) || !parsed.success) {
    return res.status(400).json({ error: "Invalid V3.5 submitted operation record" });
  }
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    const attempt = await recordManagedMacaroniV35SubmittedAttempt({
      ownerUserId: Number((req.user as { id?: number }).id),
      dropId,
      attemptId,
      operationHash: parsed.data.operationHash,
      originatedContract: parsed.data.originatedContract,
    });
    if (!attempt) return res.status(404).json({ error: "Macaroni V3.5 setup not found" });
    return res.json({
      ok: true,
      attemptId: attempt.id,
      state: attempt.state,
      operationHash: attempt.operationHash,
      originatedContract: attempt.originatedContract,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not persist submitted operation";
    return res.status(409).json({ error: message });
  }
});

router.post("/api/macaroni/v35/drops/:dropId/attempts/:attemptId/reconcile", isAuthenticated, async (req, res) => {
  const dropId = Number(req.params.dropId);
  const attemptId = Number(req.params.attemptId);
  if (![dropId, attemptId].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return res.status(400).json({ error: "Invalid V3.5 operation reconciliation request" });
  }
  try {
    const gate = await userCanUseManagedMacaroni(req.user as { id?: number; role?: string; roles?: string[] });
    if (!gate.allowed) return res.status(403).json(gate.capabilities);
    const attempt = await reconcileManagedMacaroniV35CreatorAttempt({
      ownerUserId: Number((req.user as { id?: number }).id),
      dropId,
      attemptId,
    });
    if (!attempt) return res.status(404).json({ error: "Macaroni V3.5 setup not found" });
    return res.json({
      ok: true,
      attemptId: attempt.id,
      state: attempt.state,
      operationHash: attempt.operationHash,
      error: attempt.error,
      reconciliation: attempt.reconciliation,
      reconciledAt: attempt.reconciledAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reconcile setup operation";
    return res.status(409).json({ error: message });
  }
});

router.get("/api/macaroni/v35/status/:network/:contract", async (req, res) => {
  const network = macaroniV35NetworkSchema.safeParse(req.params.network);
  const contract = String(req.params.contract || "");
  if (!network.success || !KT1_CONTRACT_ADDRESS.test(contract)) {
    return res.status(400).json({ error: "Invalid Macaroni V3.5 drop identity" });
  }
  try {
    const status = await getPublicMacaroniV35Status(network.data, contract);
    if (!status) return res.status(404).json({ error: "Macaroni V3.5 drop not found" });
    res.setHeader("Cache-Control", "no-store");
    return res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Macaroni V3.5 status";
    return res.status(503).json({ error: message });
  }
});

router.get("/api/macaroni/v35/status/:network/:contract/claims/:claimId", async (req, res) => {
  const network = macaroniV35NetworkSchema.safeParse(req.params.network);
  const contract = String(req.params.contract || "");
  const claimId = String(req.params.claimId || "");
  if (!network.success || !KT1_CONTRACT_ADDRESS.test(contract) || !/^[A-Za-z0-9:._-]{1,160}$/.test(claimId)) {
    return res.status(400).json({ error: "Invalid Macaroni V3.5 claim identity" });
  }
  try {
    const status = await getPublicMacaroniV35ClaimStatus({ network: network.data, contract, claimId });
    if (!status) return res.status(404).json({ error: "Macaroni V3.5 claim not found" });
    res.setHeader("Cache-Control", "no-store");
    return res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Macaroni V3.5 claim status";
    return res.status(503).json({ error: message });
  }
});

router.get("/api/macaroni/v35/status/:network/:contract/purchases/:operationHash", async (req, res) => {
  const network = macaroniV35NetworkSchema.safeParse(req.params.network);
  const contract = String(req.params.contract || "");
  const operationHash = String(req.params.operationHash || "");
  if (!network.success || !KT1_CONTRACT_ADDRESS.test(contract) || !/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(operationHash)) {
    return res.status(400).json({ error: "Invalid Macaroni V3.5 purchase identity" });
  }
  try {
    const status = await getPublicMacaroniV35PurchaseStatus({ network: network.data, contract, operationHash });
    if (!status) return res.status(404).json({ error: "Macaroni V3.5 purchase not indexed yet" });
    res.setHeader("Cache-Control", "no-store");
    return res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Macaroni V3.5 purchase status";
    return res.status(503).json({ error: message });
  }
});

router.post("/api/macaroni/v35/wake/:network/:contract", async (req, res) => {
  const network = macaroniV35NetworkSchema.safeParse(req.params.network);
  const contract = String(req.params.contract || "");
  if (!network.success || !KT1_CONTRACT_ADDRESS.test(contract)) {
    return res.status(400).json({ error: "Invalid Macaroni V3.5 drop identity" });
  }
  try {
    const result = await wakePublicMacaroniV35Drop(network.data, contract);
    return res.status(result.accepted ? 202 : result.registered ? 409 : 404).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not wake Macaroni V3.5 fulfillment";
    return res.status(503).json({ error: message });
  }
});

router.get("/api/macaroni/reveal-operator", async (req, res) => {
  const parsed = revealNetworkSchema.safeParse(req.query.network);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Tezos network" });
  try {
    const operator = await getMacaroniRevealOperator(parsed.data);
    res.setHeader("Cache-Control", "no-store");
    return res.json(operator);
  } catch (err) {
    return handleMacaroniSiteError(res, err);
  }
});

router.post("/api/macaroni/reveal-automation/challenge", async (req, res) => {
  const parsed = revealIdentitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid Macaroni reveal registration identity" });
  }
  try {
    res.setHeader("Cache-Control", "no-store");
    return res.json(await createMacaroniRevealRegistrationChallenge(parsed.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create reveal registration challenge";
    return res.status(503).json({ error: message });
  }
});

router.post(
  "/api/macaroni/reveal-automation",
  async (req, res) => {
    const parsed = revealRegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid Macaroni reveal registration" });
    }
    try {
      const { proof, ...registration } = parsed.data;
      try {
        await verifyMacaroniRevealRegistrationProof(registration, proof);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Reveal registration proof failed";
        return res.status(401).json({ error: message });
      }
      const user = req.user as { id?: number } | undefined;
      const job = await registerMacaroniRevealAutomation({
        ownerUserId: Number.isInteger(user?.id) ? Number(user?.id) : null,
        ...registration,
      });
      return res.status(201).json({
        ok: true,
        mode: job.mode,
        status: job.status,
        contract: job.contract,
        revealOperator: job.revealOperator,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not register automatic reveal";
      return res.status(409).json({ error: message });
    }
  }
);

router.post("/api/macaroni/reveal-request", async (req, res) => {
  const parsed = revealRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Macaroni reveal request" });
  try {
    const result = await requestMacaroniReveal(parsed.data.network, parsed.data.contract);
    return res.status(result.registered ? 200 : 404).json({ ok: result.registered, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Automatic reveal request failed";
    return res.status(503).json({ error: message });
  }
});

router.post(
  "/api/macaroni/publish",
  requirePermission("trusted_market_creator"),
  async (req, res) => {
    const parsed = publishSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid Macaroni publish payload" });
    }

    const config = parsed.data.config as Record<string, unknown>;
    const contract = normalizeMacaroniContract(config.contract);
    if (!contract) {
      return res.status(400).json({
        error: "Deploy or resume a KT1 contract before publishing to wtfOS.",
      });
    }
    config.contract = contract;

    const slug = dropSlug({ slug: parsed.data.slug, title: config.title });
    if (!slug) {
      return res.status(400).json({ error: "Invalid Macaroni drop slug" });
    }

    try {
      const user = req.user as { id: number };
      const profile = config.profile && typeof config.profile === "object"
        ? config.profile as Record<string, unknown>
        : {};
      const service = config.service && typeof config.service === "object"
        ? config.service as Record<string, unknown>
        : {};
      if (String(profile.id || config.contractVersion) === "macaroni-secure-v35"
        && service.provider === "wtfos_managed") {
        const managedDrop = (await db.select().from(macaroniV35Drops).where(and(
          eq(macaroniV35Drops.ownerUserId, user.id),
          eq(macaroniV35Drops.contract, contract)
        )).limit(1))[0];
        if (!managedDrop) {
          return res.status(409).json({ error: "This secure managed KT1 is not registered to your wtfOS account" });
        }
        config.network = managedDrop.network;
        config.assetStrategy = managedDrop.assetStrategy;
        config.service = {
          schema: "wtfos.macaroni-v35-public-service.v1",
          provider: "wtfos_managed",
          publicStatusUrl: `${publicOrigin(req)}/api/macaroni/v35/status/${managedDrop.network}/${contract}`,
          projectId: String(managedDrop.id),
        };
      }
      let state = await getUserSiteState(user.id);
      if (!state.site) state = await claimUserSite(user.id);
      if (!state.site) {
        return res.status(409).json({ error: "Claim a wtfOS site before publishing Macaroni drops" });
      }

      const creatorSocial = await loadMacaroniCreatorSocial(user.id);
      const publishedConfig = enrichMacaroniCreatorSocial(config, creatorSocial);
      const title = String(publishedConfig.title || "Macaroni Drop").trim().slice(0, 200) || "Macaroni Drop";
      const html = buildMacaroniPublishedHtml({
        config: publishedConfig,
        publicOrigin: publicOrigin(req),
      });

      await saveUserSitePage({
        userId: user.id,
        slug,
        title,
        html,
      });
      const published = await publishUserSite(user.id);
      const host = published.site?.host ?? state.site.host;
      const latestVersion = published.site?.versions?.[0] ?? null;
      const url = `https://${host}/${slug}`;
      if (latestVersion) {
        await publishQueuedWtfosOutboxForSource({
          userId: user.id,
          sourceRefType: "wtf_user_site_version",
          sourceRefId: String(latestVersion.id),
          limit: 10,
        });
      }
      const pdsRows = latestVersion
        ? await listWtfosOutboxForSource({
            userId: user.id,
            sourceRefType: "wtf_user_site_version",
            sourceRefId: String(latestVersion.id),
            limit: 10,
          })
        : [];
      const pdsDelivery = summarizePdsDelivery(pdsRows);
      const publicProbe = await probePublicMacaroniUrl(url);
      const live = pdsDelivery.ready && publicProbe.live;
      const publishStatus = !pdsDelivery.ready
        ? "pending_pds_delivery"
        : live
          ? "live"
          : "pending_public_serving";
      return res.status(201).json({
        ok: true,
        slug,
        host,
        url,
        live,
        publishStatus,
        pdsDelivery,
        publicProbe,
        site: published.site,
      });
    } catch (err) {
      return handleMacaroniSiteError(res, err);
    }
  }
);

export default router;
