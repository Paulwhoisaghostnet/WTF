import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { isAuthenticated, requirePermission } from "../auth/passport";
import {
  getIpfsPinningOverview,
  IpfsPinningError,
  publishPastaProjectBundlePinning,
  retryPinningJob,
  savePinPolicy,
  stageAndPinUpload,
} from "../features/ipfs-pinning/service";

const router = Router();

const DEFAULT_PIN_UPLOAD_MAX_BYTES = 250 * 1024 * 1024;

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function pinUploadMaxBytes(): number {
  return envInt("IPFS_PINNING_UPLOAD_MAX_BYTES", DEFAULT_PIN_UPLOAD_MAX_BYTES);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: pinUploadMaxBytes(),
    files: 1,
    fields: 8,
    fieldSize: 1024 * 1024,
  },
});

const policySchema = z.object({
  scopeType: z.enum([
    "wallet_full",
    "wallet_collection",
    "token",
    "macaroni_drop",
    "media_item",
    "project_bundle",
    "manual_upload",
  ]),
  scopeRef: z.string().trim().max(500).optional().nullable(),
  walletAddress: z.string().trim().max(80).optional().nullable(),
  sourceChain: z.string().trim().max(32).optional().nullable(),
  includeExisting: z.boolean().optional(),
  includeFuture: z.boolean().optional(),
  publicDiscovery: z.boolean().optional(),
  exclusions: z.record(z.string(), z.unknown()).optional(),
});

function runPinUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const message =
      err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? `File exceeds the ${pinUploadMaxBytes()} byte IPFS pinning upload limit`
        : "Invalid IPFS pinning upload";
    return res.status(400).json({ error: message });
  });
}

function handlePinningError(res: Response, err: unknown) {
  if (err instanceof IpfsPinningError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error("[ipfs-pinning] route error:", err);
  return res.status(500).json({ error: "Failed to process IPFS pinning request" });
}

router.get("/api/ipfs-pinning/overview", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    res.json(await getIpfsPinningOverview(user));
  } catch (err) {
    handlePinningError(res, err);
  }
});

router.post(
  "/api/ipfs-pinning/policies",
  requirePermission("use_wtfos_pinning"),
  async (req, res) => {
    const parsed = policySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid pin policy payload" });
    }
    try {
      const user = req.user as { id: number };
      const result = await savePinPolicy(user, parsed.data);
      res.status(201).json(result);
    } catch (err) {
      handlePinningError(res, err);
    }
  }
);

router.post(
  "/api/ipfs-pinning/pasta-protocol/publish",
  requirePermission("use_wtfos_pinning"),
  async (req, res) => {
    try {
      const user = req.user as { id: number };
      res.status(201).json(await publishPastaProjectBundlePinning(user));
    } catch (err) {
      handlePinningError(res, err);
    }
  }
);

router.post(
  "/api/ipfs-pinning/jobs/:id/retry",
  requirePermission("use_wtfos_pinning"),
  async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return res.status(400).json({ error: "Invalid job id" });
    }
    try {
      const user = req.user as { id: number };
      res.json(await retryPinningJob(user.id, jobId));
    } catch (err) {
      handlePinningError(res, err);
    }
  }
);

router.post(
  "/api/ipfs-pinning/upload",
  requirePermission("use_wtfos_pinning"),
  runPinUpload,
  async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Upload a file to pin" });
    try {
      const user = req.user as { id: number };
      const result = await stageAndPinUpload({
        userId: user.id,
        fileName: file.originalname || "pin-upload",
        mimeType: file.mimetype || "application/octet-stream",
        buffer: file.buffer,
        source: "manual",
        scopeType: "manual_upload",
      });
      res.status(201).json(result);
    } catch (err) {
      handlePinningError(res, err);
    }
  }
);

export default router;
